---
pubDatetime: 2024-08-26
title: Shrinking a Bloated REST API Response — Audit, Reshape, Refactor
category: backend
draft: false
image: /og-images/articles/asset-payload.jpg
tags:
  - api-design
  - performance
  - payload-optimization
  - frontend
  - refactoring
  - react
description: An implementation playbook for putting a heavy list/details endpoint pair on a payload diet — auditing unused fields, reshaping nested keys, and refactoring the frontend pages that consume them. The pattern, the trade-offs, and what makes the refactor stick.
---

![Cover Image](/og-images/articles/asset-payload.jpg)

## Introduction

A common pattern in long-lived products: two endpoints carry most of the read traffic — a **list** endpoint and a **details** endpoint — and over years they accumulate fields. Each new product type or feature adds keys; old keys are never removed. Eventually 30–40% of the response is either unused, deprecated, or redundant.

This post is the implementation playbook I followed to put exactly that kind of list/details pair on a diet, and the frontend refactor that had to ship alongside it. Trim the payload but keep the page bloated → no perceptible improvement. Refactor the page but keep the bloated payload → you've moved the cost, not removed it.

---

## Problem Statement

Two REST endpoints — a catalogue list and a per-item details endpoint — were the workhorse APIs of the platform. Every page in a critical user funnel hit at least one of them. Two compounding issues:

1. **Payload bloat.** Each new feature or item type added fields. Old fields were never removed. The list response had become a superset of every item type's needs.
2. **Frontend coupling.** The pages that consumed these endpoints had grown stateful and tangled — page-level state for things only one component used, props-drilling, CSS-in-JS, and three layered context providers.

Fixing one without the other doesn't help.

---

## Step 1 — Audit Unused Fields

The first move is unglamorous: diff the payload against the components that consume it. Every field falls into one of three buckets.

### Bucket A — Unused at the platform level (delete from response)

Fields that no consumer reads anywhere on the platform. These are the cleanest deletes — find references, confirm zero hits, drop them from the API response. Example categories of fields that ended up here:

- Legacy IDs from features that had been migrated or removed
- Highlight / promotional flags that were never wired up to a UI
- Expanded display strings that were superseded by computed values
- Internal status timestamps the frontend never displays

In practice this bucket alone accounted for **~30 keys** removed from the details response and **~8** from the list response.

### Bucket B — Unused specifically in this endpoint (still used elsewhere)

Fields that are real and used somewhere — but not on the surface this endpoint serves. They were riding along because both list and details returned the same DTO shape.

Common offenders:
- Background images / hero assets (only needed on the detail view, not the list)
- Long-form descriptions (only needed on the detail view)
- Visibility flags resolved server-side and not needed by the client
- Maximum-bound numbers used only by admin tools

These get split: the field stays on the endpoint that uses it, comes off the one that doesn't.

### Bucket C — Used (keep)

The remaining fields. These define the trimmed contract.

---

## Step 2 — Reshape Nested Keys That Don't Need to Be Nested

Trimming size is most of the win. **Reshape is the rest of it** — and reshape pays off in *consumer code*, not bytes.

Two patterns I kept hitting:

### Pattern 1 — Deeply nested values that are always read

```ts
// Before
const inputs = response.assetMappingData.calculationInputFields;
// where calculationInputFields was nested an extra level for no reason
```

The fix is structural: flatten one level. Consumer code drops the unnecessary indirection, and there's no risk of a typo on the inner key silently returning `undefined`.

### Pattern 2 — Stringly-typed booleans

```ts
// Before
if (response.spvCategoryPg === 'yes') { ... }   // string used as boolean

// After
if (response.spvCategoryDetails.isAssetPG) { ... }   // real boolean
```

A field encoded as a string (`'yes'` / `'no'`) when its values are binary is a class of bug waiting to happen. The reshape changes the contract to the proper type.

### Pattern 3 — Sibling object that should be a foreign key

```ts
// Before
response.spvParent  // { id: 6, name: 'Parent', ...other unused fields }

// After
response.spvCategoryDetails.parentID  // just the ID
```

If only the ID is used downstream, only the ID should ship.

---

## Step 3 — Refactor the Frontend That Consumes It

This is the part most teams skip. **The lean payload only pays off if the consumer is also lean.**

### Remove legacy code

Old components and styling primitives that are imported but no longer used in any modern surface still ship in the bundle:

- Page-specific filter UIs replaced months earlier
- A custom `ScreenSizeHook` component → migrated to a `useMediaQuery` hook (less re-rendering, no responsive flicker)
- CSS-in-JS primitive components (`Flex`, `Text`, etc.) → replaced by utility classes / modular CSS

### Remove props drilling

`isMobile` was being passed down four levels in places. It also lived in a context. Both got removed — the components that need it call `useMediaQuery` directly.

### Push API calls down to the components that use them

A handful of calls were happening at the page or layout level but were only needed by one child component:

| Call | Was at | Moved to |
| --- | --- | --- |
| Stats API | Top-level page | Single card component |
| Transparency data fetch | Top-level Strapi load | Same single card |
| Detail-flow setup calls | Top-level | Locked-overlay component |

A status API was also being fired three times on the page from different places — collapsed to a single call.

### Push state down

The listing page had **13 pieces of frequently-changing state** living at the page level on initial load. Each update re-rendered the whole tree. The rule I applied:

- If a state value is used by exactly one component → move it into that component
- If it's shared by two or more → put it in a Redux slice (which avoids re-rendering siblings that don't subscribe)

`useEffect`s and handlers got the same treatment — tab-change handlers, sort functions, scroll-tracking effects, all moved out of pages and into the components that owned the behaviour.

### Dynamic imports

Several components on the listing page didn't need to be in the initial bundle:

- A past-results table view (only rendered when toggled)
- An announcement widget (rare, conditional)
- A locked-overlay component and its children (conditional)
- A removal/notice card (conditional)
- A mobile drawer, video component, and mobile-specific title section (mobile-only)
- KYC banners (conditionally rendered — perfect dynamic-import candidates)

---

## A Note on Experiments and Performance Budget

A KYC banner experiment that launched mid-cycle gave me an unexpected lesson: gating its display through a single config call (instead of fetching its experiment payload from Strapi every time) reduced initial CMS load, which in turn improved FCP and LCP on every page that hosted the banner.

It's a pattern worth remembering: **experiments cost performance budget too.** Every gated component is a new fetch unless you batch.

---

## Key Takeaways

1. **Audit before you trim.** Diff the payload against actual usages. The "unused" set is bigger than you think — typically 30–40% of fields on long-lived endpoints.
2. **Shape matters as much as size.** Flattening one nested key, fixing a stringly-typed boolean, or replacing a sibling object with a foreign key cleans up consumer code more than dropping a couple of strings.
3. **Trim the API and refactor the page together.** A leaner payload landing in a bloated page is a wasted migration.
4. **State lives at the lowest level that needs it.** Pages should compose; components should own their state.
5. **Push fetches down, not up.** A `useEffect` at the page level that only one card reads is performance debt — co-locate the call with the consumer.
6. **Experiments aren't free.** Every banner gate, every variant fetch is a request. Batch experiment configs into one place.

---

## Conclusion

The most-hit APIs on a long-lived platform tend to be the ones nobody wants to touch — too many consumers, too much risk of breaking something. The way through is structured: **audit unused fields, reshape what's awkward, and refactor the consumers in the same change set.**

The lesson that scales: **payload audits and frontend refactors are the same project.** Treating them as separate tickets is how you ship one without the other and lose the wins.
