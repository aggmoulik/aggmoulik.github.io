---
pubDatetime: 2024-06-25
title: Building a Custom A/B Experiment System on Strapi
category: architecture
draft: false
image: /og-images/articles/custom-ab.jpg
tags:
  - ab-testing
  - experimentation
  - strapi
  - feature-flags
  - react
  - architecture
description: Why I passed on GrowthBook, PostHog, and Flagsmith and built a custom A/B experiment system on top of Strapi — variant DTO, weighted selection with crc32, and the failure modes I designed around.
---

![Cover Image](/og-images/articles/custom-ab.jpg)

## Introduction

Every product team eventually wants A/B experiments, and the default move is to reach for **GrowthBook**, **PostHog**, **Flagsmith**, **Unleash**, or **OpenFeature**. They're all good. They also all introduce a separate hosted service, a new SDK, and a new place where decisions live.

The team I was on already had **Strapi** as our config and content backbone. The question I asked was: do we actually need a third-party experimentation platform, or can I build a small, focused system on top of what we already run? This post is the answer — the requirements, the data model, the variant-selection algorithm, and the failure modes.

---

## Background

The third-party platforms all do roughly the same thing: host the experiment definitions, randomise users into variants, and report analytics. Useful, but they imply:

- A new service to integrate, monitor, and pay for
- Another SDK in the bundle
- An auth/identity bridge to map your users to their users
- Another moving part during incidents

I didn't need their full feature surface. What I needed was small.

---

## Product Requirements

The spec pinned to four lines:

1. **Experiments are managed in Strapi.** Same place editors already manage everything else.
2. **Each experiment can be enabled or disabled** without a deploy.
3. **Multiple experiments can run simultaneously.**
4. **Each experiment supports multiple variants with weights**, individually toggleable.

Anything beyond that — per-user targeting, sticky bucketing, exposure analytics dashboards — was explicitly out of scope. Analytics would flow through the existing event pipeline, not a new platform.

---

## Strapi Data Model

A single new collection type. Each experiment looks like this:

```
url: <experiment-name>
variants: Array<Variant>
enabled: toggle (true / false)
defaultVariantName: name of variant
```

A variant is:

```
name: <variant-name>
weightage: number
enabled: toggle (true / false)
```

The runtime DTO Strapi exposes:

```json
{
  "<experiment-name>": {
    "enabled": "boolean",
    "variants": [
      {
        "<variant-name>": {
          "weight": "number",
          "enabled": "boolean"
        }
      }
    ]
  }
}
```

**Two rules that fall out of the data model:**

- A variant with `weight <= 0` is excluded from selection
- A variant with `enabled: false` is excluded from selection
- If the entire experiment has `enabled: false`, the user gets `defaultVariantName`

`defaultVariantName` is the safety net — it's what's served when an experiment is disabled, paused, or ends. Every experiment must define one.

---

## Variant Selection: Weighted Picking

I don't track individual users on the experimentation side — no user-id-to-variant table, no cookies for sticky bucketing across devices. Each device gets a UUID at first visit, and that UUID drives bucketing.

The algorithm is the textbook weighted-pick using a hash to keep distribution stable per device:

```
Choosing a weighted variant:
For variants A, B, C with weights 4, 8, 2

variants    = [A, B, C]
weights     = [4, 8, 2]
weightSum   = 14
weightedIndex (random 0..14) = 9

AAAABBBBBBBBCC
========^
Select B
```

In code:

```javascript
function getSelectedVariant() {
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const userIdentifier = uuid();
  // A stable random number between 0 and weightSum, derived from the device UUID.
  let weightedIndex = Math.abs(crc32(userIdentifier) % weightSum);

  // Walk the sorted weights, deducting each from weightedIndex.
  // When weightedIndex drops below 0, that's the selected variant.
  // If it never drops below 0 (weights all zero or empty), fall back to the last variant.
  let selectedVariant = variants[variants.length - 1];
  for (let index = 0; index < weights.length; index++) {
    weightedIndex -= weights[index];
    if (weightedIndex < 0) {
      selectedVariant = variants[index];
      break;
    }
  }

  return selectedVariant;
}
```

### Why `crc32` and not `Math.random()`?

`Math.random()` would re-bucket the user every page load. We want **the same device to get the same variant** for the lifetime of the experiment, without storing a server-side mapping.

Hashing the device UUID with `crc32` gives:

- **Determinism** — the same input always produces the same output, so the same device always lands in the same variant
- **Reasonable distribution** — `crc32 % weightSum` distributes well enough for reasonable sample sizes
- **No external dependency** — `crc32` is a few lines of code, no SDK

The trade-off is honest: this is **device-level**, not user-level. A user on phone + desktop sees two different variants. For UI experiments where consistency *within a session/device* matters more than across them, that was acceptable. For pricing or revenue-impacting experiments, you'd want server-side, user-keyed bucketing.

---

## Reusable Hook + Component

The runtime side is a small hook and a wrapper component. The hook fetches the experiment config from Strapi (cached at the app level), runs `getSelectedVariant`, and returns the active variant. The wrapper component takes a children-as-render-prop and renders the right branch.

Two design choices that mattered:

1. **Cache the experiment config at the app level**, not per-component. Otherwise, every place that uses an experiment fires its own Strapi call.
2. **Memoize the variant selection by experiment name**, so re-renders don't re-randomise the selection. The hash is deterministic, but the work shouldn't run on every render.

---

## Known Risks

### 1. Strapi unpublishes the experiment

If an editor unpublishes the experiment data without setting `defaultVariantName`, the runtime gets nothing back from Strapi.

**Mitigation:** when the experiment payload is missing or `defaultVariantName` is absent, fall back to **the variant with the highest weight**, or — if that can't be determined — pick a random one. The user always sees something; they never see a broken page.

### 2. All variant weights are zero or disabled

The same fallback applies. You never want a UI hole because someone misconfigured a weight.

### 3. Editors don't know which variants are live

Strapi's UI doesn't make "currently active" obvious. I mitigated this with naming conventions and a small admin dashboard that polls the live experiment list.

---

## When This Is the Right Choice (And When It Isn't)

**Custom-on-Strapi makes sense when:**
- You already run Strapi and editors are comfortable there
- You don't need user-keyed bucketing, sticky cross-device variants, or audience targeting
- You want analytics in *your* event pipeline, not a vendor dashboard
- You want zero added vendors / cost / SDKs

**Reach for GrowthBook / PostHog / etc. when:**
- You need user-level bucketing across devices
- You need built-in stat-sig analysis and experiment dashboards
- Product wants self-serve audience targeting (geo, plan tier, cohort)
- The volume justifies the platform overhead

For the case I was solving — UI experiments at moderate traffic, with a well-instrumented event pipeline already in place — custom-on-Strapi was the right ratio of build-cost to feature-value.

---

## References

1. [Signal v. Noise — Feature flags](https://signalvnoise.com/svn3/feature-flags/)
2. [`@marvelapp/react-ab-test`](https://www.npmjs.com/package/@marvelapp/react-ab-test) — for hook patterns
3. [Implementing CRC32 in TypeScript](https://medium.com/@vbabak/implementing-crc32-in-typescript-ff3453a1a9e7)

---

## Key Takeaways

1. **Most teams don't need a full experimentation platform.** A weighted variant picker, a config table, and a default fallback cover 80% of UI experiments.
2. **Strapi is a fine experiment store** if it's already in your stack — editors don't learn a new tool.
3. **Use a stable hash (`crc32`) on a stable identifier (device UUID)**, not `Math.random()`, or your variants will re-randomise on every render.
4. **Always define `defaultVariantName`.** It's the only thing standing between you and a broken UI when an experiment ends.
5. **Be honest about the trade-offs.** Device-level bucketing isn't user-level. Decide which one your experiment actually needs.

---

## Conclusion

Building a custom A/B system on top of Strapi let me ship UI experiments without adding a vendor, an SDK, or a new place to look during incidents. The whole thing is a Strapi collection type, a deterministic weighted-pick function, a hook, and a fallback rule.

The broader principle: **before reaching for a platform, write down the four bullet points your team actually needs.** If they fit in your existing infrastructure, building keeps the surface area small and the dependencies few. If they don't, you'll have a much sharper question to take to the vendor.
