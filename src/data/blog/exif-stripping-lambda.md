---
pubDatetime: 2024-03-14
title: An EXIF-Stripping Lambda on S3 Uploads
category: backend
draft: false
image: /og-images/articles/exif-lambda.jpg
tags:
  - aws
  - lambda
  - python
  - privacy
  - security
  - image-processing
  - s3
description: Why I built an S3-triggered Lambda to strip EXIF metadata from uploaded images — the privacy case, the architecture, and the gotchas around format and filename preservation.
---

![Cover Image](/og-images/articles/exif-lambda.jpg)

## Introduction

Every image uploaded to your platform is also uploading a small dossier — **EXIF metadata** — that you probably didn't ask for. GPS coordinates, device serial numbers, timestamps, camera make and model, even thumbnails of the original. For most platforms, none of that is useful and some of it is a liability.

This post covers a small piece of infrastructure I put in place to make sure none of that metadata ever leaves S3 — an event-driven Lambda that strips EXIF on upload.

---

## Why Strip EXIF?

EXIF (Exchangeable Image File Format) metadata is embedded inside image files. It's useful while a photo is on the photographer's machine — sorting by date, recovering camera settings, etc. It becomes risky once the image is published or shared.

Common EXIF fields that surprise people:

- **GPS latitude and longitude** — exact location where the photo was taken
- **Device make / model / serial number**
- **Original capture timestamp** (often more precise than file mtime)
- **Camera settings** (aperture, ISO, shutter — usually fine)
- **Embedded thumbnail** — sometimes a *pre-edit* thumbnail, leaking what the user tried to hide

Two reasons to strip it before storage:

1. **Privacy / security.** Users don't expect their location to ride along with a profile picture.
2. **File size.** EXIF blocks aren't enormous, but on a high-volume image pipeline they add up. Stripping them shaves a real percentage off bandwidth and storage.

---

## Architecture

The whole thing is one S3 event source and one Lambda.

```
S3 Bucket Upload → Lambda Trigger → EXIF Removal → Re-upload to S3
```

The Lambda:

1. Receives an `s3:ObjectCreated:*` event with the bucket and key
2. Downloads the object
3. Opens it with **Pillow** (Python's PIL fork)
4. Saves it back without metadata
5. Re-uploads to the **same key** in the same bucket

Critically, the upload from the Lambda does **not** re-trigger the Lambda — I configured the event to skip a specific prefix or set a metadata flag the Lambda checks before processing. (Without that guard, you'll loop until your invoice notices.)

---

## Why Pillow?

Two reasonable options exist for Python image metadata stripping:

| Tool | Pros | Cons |
| --- | --- | --- |
| **Pillow (PIL)** | Pure Python, lightweight, packageable as a Lambda layer, well-documented | Manual handling for some edge formats |
| **ExifTool** | Comprehensive — handles every metadata block (EXIF, IPTC, XMP, GPS, etc.) | Perl binary; heavier Lambda layer; more cold-start cost |

For my case (mostly JPEG and PNG, occasional WebP), Pillow was the right size. ExifTool is the right choice when you have to scrub *every* metadata variant including XMP and IPTC — both of which Pillow handles less thoroughly.

---

## What Pillow Actually Does

The minimum viable strip is a few lines:

```python
from PIL import Image
from io import BytesIO

def strip_metadata(input_bytes: bytes) -> bytes:
    image = Image.open(BytesIO(input_bytes))

    # Re-create the image with just the pixel data — no info dict, no EXIF.
    clean = Image.new(image.mode, image.size)
    clean.putdata(list(image.getdata()))

    out = BytesIO()
    clean.save(out, format=image.format)
    return out.getvalue()
```

The trick is the `Image.new` + `putdata` — opening and re-saving the original would still carry over the metadata. Building a fresh image from raw pixel data drops everything that isn't pixels.

---

## The Three Things That Must Not Change

These were the impact points on the RFC, and they're the spec for any "preserve except metadata" pipeline:

1. **Image quality must not degrade.** Re-encoding a JPEG always loses a little — use the highest reasonable quality setting and skip re-encoding entirely if you can. Where possible, prefer `image.save(out, format=image.format, quality='keep')` for JPEGs.
2. **Filenames must not change.** The S3 key the user uploaded is the key the Lambda writes back to. Anything else breaks every reference held by the rest of the system (DB rows, CDN URLs, frontend caches).
3. **File format must not change.** A `.jpg` upload comes back out as `.jpg`, a `.png` as `.png`. Use `image.format` from the source — never assume.

These three rules are what separate "works on my laptop" from "works as middleware on a production bucket."

---

## Operational Gotchas

### 1. Avoid the recursive Lambda loop

This is the textbook foot-gun. The Lambda's own re-upload triggers another invocation, which strips already-stripped metadata, which re-uploads, which triggers the Lambda again. Two ways to break the loop:

- **Prefix-based guards.** Upload originals to `uploads/raw/`, write cleaned versions to `uploads/clean/`. The S3 trigger only watches `raw/`.
- **Metadata flag.** Tag the cleaned object with `x-amz-meta-exif-stripped: true` and bail at the top of the handler if that header is present.

I used metadata flags because it kept the existing key structure intact for the rest of the system.

### 2. Cold starts and Pillow

Pillow + its system dependencies make a non-trivial Lambda layer. Cold-start latency for the first invocation in a while was noticeable. Mitigations:

- Use **provisioned concurrency** if uploads are bursty and you need consistent latency
- Keep the layer slim — don't pull in `numpy` or `scipy` if you're not using them
- For very high volume, consider migrating to a container image with a warmer base

### 3. What about videos?

Pillow doesn't touch video. If your pipeline accepts `.mp4`, `.mov`, etc., you'll need a separate path with `ffmpeg` (which has its own metadata-stripping flags via `-map_metadata -1`). Don't try to make one Lambda do both — different runtimes, different layers, different failure modes.

### 4. WebP and HEIC

Modern formats need format-specific handling. Pillow supports WebP natively. HEIC (iPhone default) needs `pillow-heif`. Test against real device uploads before assuming "Pillow handles everything."

### 5. Don't break legitimate metadata users

Some pipelines actually use EXIF intentionally — for example, photo upload tools that auto-rotate based on EXIF orientation. If you strip metadata before applying the rotation, your images come back sideways.

The fix is to **read what you need first, then strip**:

```python
exif = image.getexif()
orientation = exif.get(274)  # EXIF tag 274 = Orientation
image = apply_orientation(image, orientation)
# Then strip everything else.
```

---

## When You'd Want This vs. When You Wouldn't

**Strip-on-upload Lambda is the right shape when:**
- User-generated images flow into S3 from many sources
- You don't control the upload client (so you can't strip client-side)
- You want a single source of truth for "stored image is clean"
- Storage / bandwidth savings are part of the value

**Skip it when:**
- You control the upload client end-to-end (do it client-side instead — saves a round-trip and Lambda cost)
- The metadata is intentional (mapping apps, photography platforms, forensic tools)
- Your image volume is so low that a manual scrubber on a cron is cheaper

---

## Key Takeaways

1. **EXIF is a privacy default that nobody opted into.** Profile pictures should not carry GPS coordinates.
2. **`Image.new` + `putdata` strips metadata properly.** Open-and-save doesn't.
3. **Preserve format, filename, and quality — those are the contract** with the rest of your system.
4. **Always guard against recursive Lambda loops.** Prefix-routing or metadata flags, but never neither.
5. **Read intentional metadata (like Orientation) before stripping.** Otherwise your users' photos come out rotated wrong.
6. **Pillow handles JPEG/PNG/WebP cleanly. HEIC needs `pillow-heif`. Video needs `ffmpeg`.** One Lambda doesn't cover all of them — don't try.

---

## Conclusion

A small piece of plumbing — one Lambda, one S3 trigger, ~50 lines of Python — closes a privacy gap that almost every platform with image uploads has by default. It's also a good case study in the difference between "code that works in a notebook" and "code that works as middleware in production": the *behaviours that must not change* (filename, format, quality, no infinite loops) end up being most of the design effort.

The more general lesson: **silent defaults are where security debt lives.** Every untrusted file your platform stores has a default surface — metadata, headers, embedded resources — that nobody chose. Closing those defaults is rarely glamorous and almost always worth the time.
