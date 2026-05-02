---
pubDatetime: 2022-09-12
title: SSL-Safe Click Tracking for SendGrid — Three AWS Approaches
category: devops
draft: false
image: /og-images/articles/sendgrid-cloudfront.jpg
tags:
  - aws
  - cloudfront
  - route53
  - sendgrid
  - dns
  - email
  - infrastructure
description: Setting up a custom SSL-enabled redirect domain for SendGrid click tracking on email campaigns. Three AWS approaches I evaluated — Load Balancer, S3 static hosting, and CloudFront — and why CloudFront won.
---

![Cover Image](/og-images/articles/sendgrid-cloudfront.jpg)

## Introduction

Email click tracking is one of those quietly important pieces of marketing infrastructure. When a user clicks a link in a campaign email, the click goes through a tracking URL — usually `sendgrid.net` or `sg-mail.example.com` — before redirecting to the real destination. To make those tracking URLs look like *your* brand (and to avoid the "this link looks suspicious" friction), you point a subdomain like `linksg.yourdomain.com` at SendGrid's tracking endpoint.

The catch: that subdomain needs **SSL** (HTTPS), and SendGrid's tracking endpoint isn't on your domain, so the cert chain doesn't just work. I needed to set this up for email campaigns going through a third-party engagement platform. This post is the three approaches I evaluated and the reasoning behind picking the third one.

---

## What We're Building

The shape we want:

```
User clicks email link
    ↓
linksg.yourdomain.com/abc123  (your subdomain, your SSL)
    ↓
sendgrid.net/abc123            (SendGrid tracks the click)
    ↓
yourdomain.com/landing-page    (real destination)
```

The user sees `linksg.yourdomain.com` in the URL bar (briefly), the click is tracked by SendGrid, and the real destination loads. The whole chain has to be HTTPS — modern browsers won't quietly redirect HTTP→HTTPS in the middle of a tracked link without warning, and email clients increasingly mark mixed-protocol redirects as suspicious.

Three approaches available on AWS. I tried each.

---

## Approach 1: Load Balancer Redirect

### How it works

1. Route 53: A record for `linksg.yourdomain.in` → existing AWS Load Balancer
2. Load Balancer: rule — if Host header is `linksg.yourdomain.in`, redirect to `http://sendgrid.net`

### What it gets right

- Zero new infrastructure — reuse the existing ALB
- Centralised redirect logic
- Cheapest possible setup

### Why it didn't work

> **You can't add or modify the `Host` header on an ALB redirect.**

ALB redirects rewrite the location, but the request that lands at SendGrid arrives without the right Host header. SendGrid uses the Host to look up which sender's tracking link this is, so click tracking silently breaks.

If your redirect target doesn't care about the Host header, ALB is fine. SendGrid does, so it's out.

---

## Approach 2: S3 Static Site Redirect

### How it works

1. Create an S3 bucket with the same name as the subdomain (`linksg.yourdomain.in`)
2. Enable Static Website Hosting
3. Drop an `index.html` whose `<script>` does a JS-based redirect, including the right Host
4. Front it with CloudFront for SSL
5. Route 53: A record → CloudFront → S3

### What it gets right

- Cheap (S3 + CloudFront pennies)
- Fully SSL-capable via CloudFront
- Easy to test (just hit the bucket URL)

### Why it didn't work

Two issues, in order of severity:

1. **CORS errors on the redirect.** Browsers block the JS-driven redirect to `sendgrid.net` because the cross-origin request fails the same-origin checks SendGrid expects. You can paper over some CORS, but you can't change SendGrid's policy from your S3 bucket.
2. **You're already using CloudFront for the SSL.** Once CloudFront is in the picture, doing the redirect *in CloudFront itself* is structurally cleaner than bouncing through an S3 page that does a JS redirect. The S3 layer becomes redundant.

Once I realised approach 3 used the same CloudFront I already had to provision, S3 stopped making sense.

---

## Approach 3: CloudFront Distribution (Chosen)

### How it works

1. **Route 53**: A record for `linksg.yourdomain.in` → CloudFront distribution
2. **CloudFront**: configured to forward to SendGrid's tracking endpoint with the right headers and the SSL cert attached to your subdomain
3. **SSL**: ACM cert covering `linksg.yourdomain.in` attached to the CloudFront distribution

SendGrid documents the exact CloudFront configuration here:
[How to configure SSL for click tracking using CloudFront](https://support.sendgrid.com/hc/en-us/articles/4412701748891)

### Why this works

- **Full control over headers**, including Host. No surprises arriving at SendGrid.
- **SSL terminates cleanly at CloudFront** with an ACM cert covering the subdomain. The whole chain stays HTTPS.
- **CloudFront is already a CDN we use elsewhere** — no new tool, just a new distribution.
- **Caching can be tuned per behaviour**, useful for the static parts of the response chain.

### Trade-offs to know

- A CloudFront distribution costs more than nothing — but in the same order of magnitude as S3, and CloudFront is already in the stack.
- DNS propagation isn't instantaneous — first-time setup needs ~30 minutes of patience before the cert + Route 53 + CloudFront wiring feels stable.
- ACM certs need to be in `us-east-1` for CloudFront. This catches first-timers — if the cert is in another region, CloudFront won't see it.

---

## Side-by-Side

| Concern | ALB | S3 + JS | CloudFront |
| --- | --- | --- | --- |
| Host header control | ❌ | ⚠️ (JS-only) | ✅ |
| SSL on subdomain | needs work | via CloudFront anyway | ✅ |
| CORS-safe to SendGrid | ✅ | ❌ | ✅ |
| New infra needed | none | S3 + CloudFront | CloudFront |
| Operational complexity | lowest | medium | medium |
| Cleanest separation of concerns | medium | low | high |

CloudFront wasn't dramatically more work than the alternatives — and it was the only one that actually delivered a working tracked click with the right Host header.

---

## Implementation Notes That Saved Time

- **ACM cert region**: must be `us-east-1` for CloudFront, regardless of where the rest of your infra lives.
- **DNS validation, not email validation**: makes the cert renewal hands-off forever after.
- **Origin path**: be explicit about whether SendGrid expects `/` or a sub-path — the docs are right but easy to misread on first attempt.
- **Cache behaviour**: redirects shouldn't be cached. Set `Cache-Control: no-store` (or use a managed policy that doesn't cache) on the redirect behaviour to avoid a stale link forever pointing the wrong way after a SendGrid config change.
- **Test with `curl -v`** before testing in a browser — you'll see the Host header, the redirect chain, and the cert chain all at once.

---

## Why I Bothered Writing This Down

This is the kind of infrastructure problem you only solve once per company, and the documentation gets scattered across SendGrid docs, AWS docs, and tribal knowledge. Three near-identical-looking approaches (DNS → AWS thing → SendGrid) each fail differently, and the failure modes only show up when real campaigns run — not in dev testing.

The decision tree generalises:

> When you need a custom-branded redirect with SSL to a third-party service that cares about Host headers, **CloudFront with ACM is almost always the right answer** on AWS. ALB redirects can't carry the right Host. S3 static hosting forces a JS-based redirect that runs into CORS at the destination. CloudFront sits in the middle and gives you full control over the request that reaches the third party.

---

## Key Takeaways

1. **ALB redirects can't change the Host header.** If your redirect target uses Host for routing or auth, ALB is the wrong tool.
2. **S3 static hosting + JS redirects fight CORS at the destination.** Some destinations let you paper over it; SendGrid doesn't.
3. **CloudFront is the AWS-native answer for SSL + branded redirect**, especially for SendGrid (which has explicit docs for this exact setup).
4. **ACM certs for CloudFront live in `us-east-1`**, regardless of the rest of your infra.
5. **Don't cache redirects.** Set explicit no-store cache behaviour or you'll be debugging a stale link days after you fixed it.
6. **`curl -v` before browser testing.** Headers and cert chains tell you what went wrong; browser failures often don't.

---

## Conclusion

Setting up a branded SSL redirect for email click tracking sounds like a five-minute task and turns into half a day if you start with the wrong AWS primitive. Of the three I tried, **CloudFront + ACM** was the only one that delivered a working SSL chain with the Host header SendGrid needs — and the SendGrid docs walk through the exact distribution config.

The general principle: **when a third party cares about your headers, you want a CDN-style proxy in front, not a load balancer redirect or a JS bounce.** It's a few extra knobs, but every knob is one you actually need.
