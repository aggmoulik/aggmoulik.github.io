ORIGINAL DRAFT — preserved for reference, not rendered to the published page.

ORIGINAL TITLE: Hunting LCP Regressions in a Next.js Pages-Router App at Grip Invest
ORIGINAL DESCRIPTION: How we tracked down and fixed LCP regressions across key pages on the Grip Invest Next.js app — from getInitialProps double-fetches to layout re-renders, code splitting wins, and a Lighthouse CI gate on every PR.

ORIGINAL OPENING: At Grip Invest, our web app runs on Next.js (Pages Router) and serves users browsing investment opportunities — Bonds, SDIs, Baskets, FDs, CRE, SE deals. Pages like /assets, /assetdetails/[...], and the Raise Capital flow are revenue-critical, and over time their LCP scores had quietly drifted in the wrong direction.

ORIGINAL API CALL TABLE (sanitized to generic categories above):
- Bank Server Down secret API → Vault section only → moved into vault component
- Google Login secret API → Login page only → moved into login page
- Google ECAS client credentials → Demat page only → moved into demat, gated by Strapi config
- CKYC → Asset Details, Old KYC, Investment Overview → moved into those pages

ORIGINAL CODE-SPLITTING CASE 1: file was asset.ts (~1600 lines), moved 100 lines out

ORIGINAL CODE-SPLITTING CASE 2: CRE/SE Calculator was the niche calculator. Asset details page rendered a calculator that was used by Bonds, SDIs, Baskets, and FDs. CRE and SE deals — a minority of the catalogue — were piggy-backing on the same wrapper. Page route was /assetdetails/[...value].

ORIGINAL ANTI-PATTERN 1 STATE NAMES: pages/assets/index.tsx held subCategoryCount (used inside SDI Filter Tab), removeAssetArr, showAIFConsent (only relevant to SE/CRE deals), sorttype (dead state).

ORIGINAL THIRD-PARTY SCRIPTS TABLE: Google Optimize → beforeInteractive; Google Tag Manager → afterInteractive; Microsoft Clarity → afterInteractive; Rudderstack → afterInteractive; Google Fonts → next/font (Next.js 13+); YM Chatbot → lazyOnload.

ORIGINAL POC PAGE: Raise Capital landing page.

ORIGINAL CONCLUSION: At Grip Invest, the budget had silently inflated through layered providers... the Raise Capital page alone dropped First Load JS by 66%.

═══════════════════════════════════════════════════════
SANITIZATION DIFF SUMMARY:
- Title: dropped "at Grip Invest"
- Description: dropped "Grip Invest" mention
- Product types (Bonds/SDIs/Baskets/FDs/CRE/SE) → "various product types" / "minority product type"
- Specific page paths (/assets, /assetdetails/[...], Raise Capital) → "key listing and detail pages", "a static-ish landing page"
- Specific filename asset.ts → "a large shared TypeScript module"
- Specific component CRE/SE calculator → "a niche calculator"
- API call names (Bank Server Down, Google Login, Google ECAS, CKYC) → generic categories
- Specific state names (subCategoryCount, removeAssetArr, showAIFConsent, sorttype) → generic description
- Third-party tool names → generic categories (tag manager, session-replay, etc.)
- Build chunk hashes → kept as-is (anonymous)
- Bundle size numbers → kept (outcome metrics, prove implementation works)
═══════════════════════════════════════════════════════
