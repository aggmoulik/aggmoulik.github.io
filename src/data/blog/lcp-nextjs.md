---
pubDatetime: 2025-01-15
title: Hunting LCP Regressions in a Next.js Pages-Router App
category: frontend
draft: false
image: /og-images/articles/lcp-nextjs.jpg
tags:
  - frontend
  - nextjs
  - performance
  - lighthouse
  - core-web-vitals
description: Tracking down and fixing LCP regressions across key pages in a Next.js Pages-Router app — from getInitialProps double-fetches to layout re-renders, code-splitting wins, and a Lighthouse CI gate on every PR.
---

![Cover Image](/og-images/articles/lcp-nextjs.jpg)

## Introduction

I worked on a Next.js (Pages Router) app where revenue-critical listing and detail pages had quietly drifted to LCP > 4s on mid-tier devices. This post walks through the implementation challenges and how each was solved: the `getInitialProps` double-fetch trap, layout-level re-renders, code-splitting wins, third-party script discipline, and the Lighthouse CI gate I put on every PR.

---

## Problem Statement

The Performance score in Lighthouse is a weighted average of metric scores. **LCP and CLS** carry the most weight, so those were the primary targets — bundle bloat directly hurts LCP because the page can't paint its largest element until enough JS has been parsed and executed.

**Symptoms:**
- LCP > 4s on revenue-critical listing and detail pages on mid-tier devices
- Slow page-to-page transitions — everything felt sluggish, not just first paint
- Lighthouse Performance scores below 50 on key pages
- Layout shifts during navigation
- A single `_app` chunk that everything depended on

---

## Lighthouse Priorities — What Actually Moves the Needle

Ranked the intervention surface by impact:

| Area | Impact | Why |
| --- | --- | --- |
| Scripts (3rd-party) | 🔴 High | Block the main thread during hydration |
| Bundle size / code splitting | 🔴 High | Drives LCP directly |
| Layout structure | 🔴 High | Causes whole-tree re-renders |
| Styles (CSS vs CSS-in-JS) | 🟡 Medium | CSS-in-JS adds JS to SSR pages |
| Images | 🟢 Low | Easy wins via `next/image` |
| Fonts | 🟢 Low | WOFF2 + `next/font` |

The first three got the bulk of the work.

---

## The `getInitialProps` Double-Fetch Trap

The `_app.tsx` was using `getInitialProps` to fetch a handful of "global" config blobs. The catch with `getInitialProps`:

> It runs **server-side on first load**, then **client-side on every route transition** via `next/link` or `next/router`.

Translation: every navigation re-fetched the same global config blobs the user already had. They were being paid for twice — once on cold load, then again on every transition.

**Audit pattern:** for every call happening in `_app`, ask one question — "Does every page actually need this?" The answer was almost always no. Several config calls (auth-related secrets, conditional feature flags, compliance flags) were only consumed on a handful of pages. Each got pushed down to the page or component that actually used it.

**Result:** ~4 fewer API calls per route transition. Transition time dropped noticeably, and `_app` got back to doing its job — initialising third-party scripts and providers, nothing more.

> **Rule:** `_app.tsx` should hold zero data-fetching `useEffect`s. If a piece of data is only needed on N pages, it lives on those N pages.

The Next.js team's recommendation here is the App Router, which makes this kind of co-location structural rather than aspirational.

---

## Code Splitting: Real Numbers

Two POCs to prove the value of moving logic out of shared chunks before committing to a sweep across the codebase.

### Case 1 — Splitting a large shared module

A shared TypeScript module of ~1,600 lines was imported into the shared chunk. Pulling out ~100 lines into a separate file:

**Before:**
```
+ First Load JS shared by all              342 kB
  ├ chunks/framework-...                    45.2 kB
  ├ chunks/main-...                         32.2 kB
  ├ chunks/pages/_app-...                   244 kB
  ├ css/...                                 14 kB
  └ other shared chunks (total)             6.05 kB
```

**After:**
```
+ First Load JS shared by all              337 kB
  ├ chunks/framework-...                    45.2 kB
  ├ chunks/main-...                         32.2 kB
  ├ chunks/pages/_app-...                   240 kB
  ├ css/...                                 14 kB
  └ other shared chunks (total)             6.07 kB
```

**~5 KB off First Load JS for moving 100 of 1,600 lines.** Linear extrapolation isn't accurate for tree-shaken modules, but it told me the file was carrying real weight worth chasing.

### Case 2 — Lazy-loading a niche calculator

A calculator component used by one minority product type was piggy-backing on the same wrapper used by the majority of product types. Splitting it into its own component, mounted only when needed:

**Before:**
```
ƒ /detail/[...]                            129 kB          658 kB
```

**After:**
```
ƒ /detail/[...]                            125 kB          612 kB
```

**~46 KB off the page's total First Load**, plus the dead `useEffect`s and state updates stopped firing for users who'd never see the calculator.

---

## Layout Re-Renders: The Hidden Tax

The shell looked like this:

```tsx
<Provider store={store}>
  <Main>
    <GlobalContext.Provider value={globalContextData}>
      {urlPathName.startsWith('/external-ui')
        ? <GCExternalUI />
        : <Layout>
            <Component {...pageProps} />
          </Layout>}
    </GlobalContext.Provider>
    <ToastContainer limit={1} />
    <Toast />
  </Main>
</Provider>
```

Three layout files — `_app.tsx`, `Main.tsx`, `Layout.tsx` — each doing a bit of everything. When a parent re-renders, every child re-renders, so a stale `useEffect` or unstable context value at the top of the tree means **the entire app paints again**.

### What I standardised

**`_app.tsx` should hold:**
- Provider mounts (Redux, theme, query client)
- Third-party script initialisation
- That's it. No fetches, no `useEffect`s, no per-page state.

**`Layout.tsx` (Navigation + Footer) should:**
- Sit *outside* anything that re-fetches global data, so navigation doesn't repaint on every config refresh
- Be moved structurally so it's not nested inside `Main`

**`Main.tsx`:**
- Holds app-wide modals and on-mount calls used by every page
- Got moved *inside* `Layout` — the original nesting (Layout inside Main) was forcing imports onto pages that didn't need them

### Two costly anti-patterns I ripped out

1. **Page-level state that didn't belong on the page.** A listing page was holding several pieces of state used only inside specific child components — props-drilled, triggering context re-renders. Most got pushed down into the components that used them; some were dead state and got deleted.

2. **`react-device-detect` everywhere.** It re-renders the tree on resize and the library itself recommends `matchMedia`. I replaced it with a small custom hook around `matchMedia`, used inside the components that actually care.

> **Rule:** state lives at the lowest component that needs it. Pages directories should be thin — routing + composition.

---

## Third-Party Scripts: `next/script` Discipline

Third-party scripts were the biggest single source of main-thread blocking time. `next/script` exposes four loading strategies:

- `beforeInteractive` — load before any Next.js code, before hydration
- `afterInteractive` *(default)* — load early but after some hydration
- `lazyOnload` — load during browser idle
- `worker` *(experimental)* — load in a web worker (avoid)

I audited every third-party integration and assigned a priority:

| Integration type | Impact | Strategy |
| --- | --- | --- |
| Experimentation script (must run before UI decisions) | High | `beforeInteractive` |
| Tag manager | High | `afterInteractive` via `next/script` |
| Session-replay / heatmap | High | `afterInteractive` |
| Analytics SDK | High | `afterInteractive` |
| Web fonts | High | Migrated to `next/font` for self-hosting |
| Chatbot widget | Medium | `lazyOnload` — nobody needs the chatbot before paint |

The chatbot move was the easiest win — pure deferral, zero functionality lost.

---

## Styles: CSS over CSS-in-JS for SSR

The app was using a CSS-in-JS solution that emitted styles via JavaScript at runtime. On SSR pages this means:

1. The server renders HTML.
2. The client downloads JS that includes the styling logic.
3. Hydration runs, styles get applied, layout shifts.

Steps 2–3 are CLS and main-thread work that plain CSS doesn't have. I migrated styled components to plain CSS / utility classes wherever they didn't need runtime theming, and used unstyled MUI primitives where I wanted behaviour without the runtime cost.

---

## Bundle-Size POC: A Static-ish Landing Page

I picked a static-ish, bloated landing page as a clean POC.

**Two interventions:**
1. `next/dynamic` for below-the-fold sections
2. Removed CSS-in-JS

| | Before | After | Δ |
| --- | --- | --- | --- |
| First Load JS | 692 KB | 234 KB | **−66%** |
| Page size | 20 KB | 12 KB | **−40%** |

That POC bought internal buy-in to do the same sweep across the rest of the high-traffic surfaces.

---

## Lighthouse CI: A Gate on Every PR

Manual audits don't survive contact with a fast-moving team. I wired up a GitHub Action that runs Lighthouse on every PR and posts results back as a PR comment.

**What the workflow does:**
- Runs Lighthouse on **mobile and desktop** profiles
- Comments scores directly on the PR
- Stores HTML reports in GitHub Artifacts (and S3 for retention)
- Sends a Slack notification with branch + author when scores regress
- **Fails the workflow** when a configured minimum isn't met

The "fails the workflow" part is what matters. Performance budgets only work when they block merges — otherwise they're decoration.

---

## Key Takeaways

1. **`getInitialProps` runs twice.** If you're on Pages Router, audit every call in `_app` and ask whether it's truly app-global. Most aren't.
2. **Layout structure is performance code.** Wrapping the entire tree in providers that re-render kills you silently. Lift fetches down, not up.
3. **Code-split with proof, not vibes.** Two small POCs with concrete numbers gave me the data to justify the sweep. Without numbers, "we should split things" is a stalled ticket.
4. **Third-party scripts are the highest-ROI fix.** `next/script` strategies are free and the chatbot doesn't deserve `beforeInteractive`.
5. **CSS-in-JS is a poor SSR fit.** Runtime styling means runtime CLS.
6. **Performance regressions need a CI gate.** A Lighthouse PR check that *fails* the build is the only way budgets stick.

---

## Conclusion

LCP isn't fixed by a single trick — it's fixed by a budget. The budget had silently inflated through layered providers, double-fetches, CSS-in-JS, and unstrategically loaded third-party scripts. Pulling each thread back gave measurable wins (the landing-page POC alone dropped First Load JS by 66%) and, more importantly, a CI gate that keeps the gains.

The lesson that generalises: **most LCP problems are architectural, not algorithmic.** Where state lives, where data is fetched, and what runs on hydration matter more than micro-optimisations. Fix the structure, then measure.
