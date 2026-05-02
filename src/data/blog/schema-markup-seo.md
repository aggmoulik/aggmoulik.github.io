---
pubDatetime: 2023-02-27
title: Schema Markup and SEO Resolutions
category: seo
draft: false
image: /og-images/articles/schema-seo.jpg
tags:
  - seo
  - schema
  - structured-data
  - json-ld
  - nextjs
  - search
description: How to add structured data (Logo, FAQ, BlogPosting) to a production site for richer search results, and the SEO resolutions worth working through — canonicals, 404s, redirects, and noindex hygiene.
---

![Cover Image](/og-images/articles/schema-seo.jpg)

## Introduction

Search isn't a one-shot fix. On a production site I worked on, there were two related issues: **the structured-data layer was missing** (Google didn't have rich signals to work with), and **the indexing hygiene around URLs was inconsistent** (canonical mismatches, 404s, post-login pages getting indexed, missing meta tags).

This post covers both fronts — the schemas worth adding, why they matter, and the SEO resolutions worth working through page-by-page.

---

## What Schema Markup Actually Buys You

Schema markup is structured data, usually written as JSON-LD, that tells search engines *what* a page is about — not just what words it contains. Google uses it to enable richer search treatments: review stars, FAQ accordions in SERPs, knowledge-panel logos, "Top Stories" carousels, and so on.

Tangible benefits:

1. **Higher click-through rates** — rich results take more SERP real estate
2. **Greater search visibility** — eligibility for features like FAQ and How-To
3. **Faster indexing** — clearer entity signals
4. **Voice search** — assistants lean heavily on structured data to answer queries

Structured data isn't a ranking factor in the strict sense, but it changes how your result *looks* and what SERP features you can show up in. That moves CTR, which feeds back into rankings.

---

## Three Schemas Every Site Should Have

Three schemas were missing across the board on the site I audited.

### 1. Logo (Organization)

Tells Google which image to use for your brand in Search results and the Knowledge Panel.

**Required properties:**

| Property | Details |
| --- | --- |
| `logo` | URL or `ImageObject` — the image used as the org logo. Must be **at least 112×112px**. |
| `url` | The URL of the website associated with the organization. |

This is a one-line install with outsized branding payoff.

### 2. FAQ (FAQPage)

If a page has a list of questions and answers, marking them up with `FAQPage` makes them eligible for an inline FAQ accordion in SERPs.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is the return policy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Most unopened items in new condition and returned within 90 days will receive a refund or exchange."
      }
    },
    {
      "@type": "Question",
      "name": "How long does it take to process a refund?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We will reimburse you for returned items in the same way you paid for them."
      }
    }
  ]
}
```

**Content rules that bite if you skip them:**
1. Use `FAQPage` only when each question has a single answer.
2. No advertising content.
3. The full text of the question and answer must be in the markup.
4. The FAQ must be visible to users on the page — Google penalises hidden or accordion-only-in-markup FAQs.
5. **If the same FAQ appears across multiple pages, mark up only one instance for the entire site.** Repeating it gets you ignored at best, penalised at worst.

### 3. Article (BlogPosting)

For blog and article pages, `BlogPosting` (a child of `Article`) tells Google the author, headline, publish date, and images.

**Required properties:**

| Property | Required? |
| --- | --- |
| `author` (Person or Organization) | yes |
| `author.name` | yes |
| `author.url` | yes |
| `headline` | yes |
| `image` | yes |
| `dateModified` | optional |
| `datePublished` | optional |

**Image rules worth noting:**
- Every page must have at least one image
- URLs must be crawlable and indexable (no auth-walled images)
- Provide multiple aspect ratios where possible — **16:9, 4:3, 1:1**
- Images must actually represent the marked-up content

---

## How I Implemented It

Schema is shipped as a JSON-LD `<script type="application/ld+json">` block in the `<head>` (or `<body>`). Google reads JSON-LD even when it's injected dynamically.

I chose to **manage the JSON-LD blob through a Strapi single-type**. Editors get a JSON field, and updates ship without a redeploy. Trade-off: editors can produce invalid schema, so I paired it with a validation step in the build (Schema Markup Validator + Rich Results Test).

**Tools:**

- [Schema Markup Generator](https://technicalseo.com/tools/schema-markup-generator/) — for templating
- [Schema Builder Chrome Extension](https://schema.dev/schema-builder/) — for inspecting competitors and live pages
- [Schema Tester Chrome Extension](https://schema.dev/schema-tester/) — for validating before shipping

---

## SEO Resolutions: The Indexing Hygiene Pass

Schema is the offensive side. Indexing hygiene is the defensive side. A handful of issues kept showing up in Google Search Console that needed working through.

### 1. Alternative page with proper canonical tag

Several URL patterns had the same canonical pointing to the same page — usually because of UTM and referral parameters in the URL.

**Fix:** block parameter variants in `robots.txt` so they aren't crawled or indexed.

```
Disallow: /*?utm_source=*&referralCode=*&ref=*&utm_medium=*
```

This stops marketing-tracking variants from polluting Search Console reports and being treated as separate URLs.

### 2. 404 errors

Four ways to handle them, in order of preference:

1. **Redirect** to a relevant page (not just the homepage — be specific)
2. **Restore the page** if it's still in demand and there's no good redirect target
3. **Correct the link** at the source (only works for links you control)
4. **Custom 404 page** so the visit isn't wasted — surface related content

### 3. Duplicate without user-selected canonical

Pages with no real content (placeholder routes that were never filled in) need to be either filled in, redirected, or removed entirely. Empty pages confuse canonical resolution.

### 4. Post-login pages indexed

Authenticated routes don't belong in Google's index. Block them in `robots.txt` so the crawler doesn't waste budget and so user-specific URLs don't surface in SERPs.

### 5. 5xx response on missing slugs

When a blog or marketing slug isn't found, the app was returning a 5xx. Two fixes:

- Missing blog slug → redirect to the blogs homepage
- Missing marketing page → redirect to the homepage

**301 vs 302:** use **301 (permanent)** when the original URL won't come back. Use **302 (temporary)** for genuinely temporary redirects like maintenance windows or short-term campaigns. Most "404 → relevant page" cases want 301.

### 6. Excluded by `noindex` — verifying it's intentional

A batch of subdomain URLs were flagged as excluded by `noindex`. After verifying these were internal/staging subdomains, I left them as-is — this was working as intended.

### 7. Missing meta tags

A legal/terms page was missing meta tags. Every public page should have at minimum a title and description tag. Cheap to fix, easy to forget.

---

## Key Takeaways

1. **Three schemas cover the highest-leverage cases for most sites:** Logo, FAQPage, BlogPosting.
2. **Don't repeat FAQ markup across pages.** Mark it up once. Google's guidelines explicitly call this out.
3. **Manage JSON-LD through your CMS** if editors need to update it — but pair it with validation, since invalid schema fails silently.
4. **Block tracking parameters in `robots.txt`** to keep canonical reports clean.
5. **404s deserve a strategy, not a default page.** Decide per pattern: redirect, restore, fix, or design a useful 404.
6. **Use 301 for permanent redirects.** Most "page moved" cases are permanent — using 302 leaks link equity.
7. **Verify every "excluded" URL in Search Console.** Some are correct (subdomains, staging) — confirming that intent prevents future debugging.

---

## Conclusion

SEO improvements compound. Adding structured data on its own gives Google better signals; cleaning up canonicals, 404s, and redirects on its own makes the index cleaner. Doing both together is what unlocks rich results, faster indexing, and a SERP presence that converts.

The general rule: **structured data is what your page *means*; indexing hygiene is what your page *is*.** Search engines need both to do their job well.
