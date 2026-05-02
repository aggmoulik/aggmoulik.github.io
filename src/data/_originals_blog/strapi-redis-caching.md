ORIGINAL DRAFT — preserved for reference, not rendered to the published page.

ORIGINAL TITLE: Adding Redis Caching to Strapi — 5× Throughput at Grip Invest
ORIGINAL DESCRIPTION: How we put Redis (AWS ElastiCache) in front of Strapi at Grip Invest — 5× request throughput, p50 latency from 2,695ms down to 66ms, and 50%+ reduction in pod and memory usage under load.

ORIGINAL ENDPOINT NAMES (sanitized to "Endpoint A/B/C/D" above):
- Experiments Data (high write/invalidation churn — was the outlier with elevated p99)
- Article Data Navigation
- Discovery Data
- Footer Data

ORIGINAL OPENING: In an earlier post I covered how we trimmed Strapi REST payloads using populate.on. Query tuning helped, but the underlying problem remained: every read hit the database, and Strapi was the bottleneck under load. This post covers what happened when we put Redis (via AWS ElastiCache) in front of Strapi at Grip Invest — the load test, the results, the release plan, and the trade-offs we accepted.

ORIGINAL TEST DESCRIPTION: I benchmarked two environments under identical conditions to isolate the effect of Redis caching... Endpoints under test: Experiments Data, Article Data Navigation, Discovery Data, Footer Data — the four highest-volume Strapi endpoints powering the Grip Invest frontend.

ORIGINAL OUTLIER NAME: "The Experiments outlier" / "The Experiments Data endpoint kept a meaningful p99 even with Redis"

ORIGINAL RELEASE SECTION: "DevStrapi replica" / "Deploy a replica of the current DevStrapi service to the QA environment" / "Create a replica of the current DevStrapi database"

ORIGINAL CONCLUSION: "Putting Redis in front of Strapi at Grip Invest was the single largest performance win we shipped on the CMS layer..."

═══════════════════════════════════════════════════════
SANITIZATION DIFF SUMMARY:
- Title: dropped "at Grip Invest"
- Description: dropped Grip Invest mention
- Endpoint names (Experiments Data, Article Data Navigation, Discovery Data, Footer Data) → "Endpoint A/B/C/D"
- "DevStrapi" → "Strapi service" / "Strapi"
- "the Grip Invest frontend" → "the frontend"
- "we" / "our" → neutral first-person ("I") and impersonal framing
- All performance numbers, infra savings, acceptance criteria preserved verbatim — they're outcome metrics, not company data
═══════════════════════════════════════════════════════
