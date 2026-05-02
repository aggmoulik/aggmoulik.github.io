---
pubDatetime: 2025-05-05
title: Adding Redis Caching to Strapi — 5× Throughput on Production
category: backend
draft: false
image: /og-images/articles/strapi-redis.jpg
tags:
  - strapi
  - redis
  - performance
  - caching
  - load-testing
  - infrastructure
  - elasticache
description: Putting Redis (AWS ElastiCache) in front of Strapi delivered 5× request throughput, p50 latency from 2,695ms down to 66ms, and 50%+ reduction in pod and memory usage under load. Here's the implementation, the load test, and the trade-offs.
---

![Cover Image](/og-images/articles/strapi-redis.jpg)

## Introduction

In an [earlier post](/articles/strapi-populate-on) I covered how to trim Strapi REST payloads using `populate.on`. Query tuning helps, but the underlying problem remains: every read hits the database, and Strapi is the bottleneck under load.

This post covers what happened when I put **Redis (via AWS ElastiCache)** in front of Strapi — the load test, the results, the release plan, and the trade-offs I accepted.

---

## The Setup

I benchmarked two environments under identical conditions to isolate the effect of Redis caching.

**Test conditions:**
- **Tool:** k6-style load test
- **Virtual users:** 100
- **Duration:** 1 minute
- **Profile:** Fixed concurrency
- **Endpoints under test:** four high-volume Strapi endpoints powering the frontend

**Two environments:**
1. **QA without Redis** — vanilla Strapi, hitting the database for every request
2. **Pre-prod with Redis** — same Strapi, ElastiCache (Redis) in front

---

## Before: Strapi Without Redis

| Endpoint | Total Requests | Req/s | Avg (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Error % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Endpoint A | 549 | 8.19 | 2,695 | 8,785 | 13,418 | 19,060 | 0.18 |
| Endpoint B | 533 | 7.95 | 813 | 1,838 | 2,115 | 2,686 | 0.19 |
| Endpoint C | 495 | 7.38 | 2,549 | 6,585 | 7,420 | 9,263 | 0 |
| Endpoint D | 473 | 7.06 | 1,639 | 3,847 | 4,895 | 5,516 | 0 |

The numbers tell the story. **Average response times of 813–2,695 ms** for content that almost never changes. One endpoint's p99 was creeping toward 20 seconds. Throughput plateaued at 7–8 req/s per endpoint.

---

## After: Strapi With Redis (ElastiCache)

| Endpoint | Total Requests | Req/s | Avg (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Error % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Endpoint A | 2,658 | 39.64 | 452 | 64 | 1,162 | 13,397 | 1.69 |
| Endpoint B | 2,655 | 39.59 | 66 | 86 | 92 | 126 | 0.45 |
| Endpoint C | 2,651 | 39.53 | 66 | 77 | 86 | 120 | 0.41 |
| Endpoint D | 2,646 | 39.46 | 66 | 57 | 68 | 115 | 0.38 |

---

## The Comparison

| Metric | Without Redis | With Redis | Change |
| --- | --- | --- | --- |
| Requests/sec | ~7–8 | ~39–40 | **~5× throughput** |
| Average response time | 813–2,695 ms | 66–452 ms | **up to ~95% reduction** |
| p99 latency | 2,686–19,060 ms | 115–13,397 ms* | substantially lower |
| Error rate | 0–0.19% | 0.38–1.69% | small uptick |

*The Endpoint A p99 outlier is discussed below.

### What jumps out

1. **~5× throughput across the board.** Same hardware, same Strapi, just Redis in front. The DB stopped being the limiter.
2. **Latency collapse.** Three of four endpoints settled at a flat **66 ms average** with Redis — at that point I was measuring Redis + network, not Strapi.
3. **p90/p95 stability.** The non-Redis case had wide tails (p95 of 2.1–13.4 seconds). With Redis, p90/p95 sit between 57–162 ms on the well-cached endpoints. **Tail latency is where Redis really earns its keep.**
4. **Modest error increase (still < 2%).** A small price — likely cache-miss races and edge cases on first writes during the test window.

### The Endpoint A outlier

Endpoint A (the heaviest of the four — frequently invalidated by editor writes) kept a meaningful p99 even with Redis (13,397 ms) and the highest error rate (1.69%). Two likely causes:

1. **Cache miss → DB fallback under contention.** When the cache key expires during a test burst, every concurrent request that hits the miss races to the DB.
2. **Higher write/invalidation churn.** This endpoint is touched more often by editors, so the cache is invalidated more frequently.

Mitigations on the roadmap: stale-while-revalidate semantics on this key, slightly longer TTL with manual invalidation on publish, and request-coalescing at the cache layer so only one request goes to the DB on a miss while others wait on the result.

---

## The Quietly Huge Result: Infra Cost

This is the number that surprised me most:

> **Without Redis:** the Strapi pod **spiked to over 1 GB memory** and Kubernetes auto-scaled to **4 pods** to absorb the load.
>
> **With Redis:** the same load was handled with **< 450 MB memory** and just **2 pods** — a **>50% reduction** in compute footprint.

Caching isn't only a latency story; it's a **resource-utilisation** story. Half the pods, less than half the memory, for the same traffic. At cloud-bill-paying scale that compounds quickly.

---

## How I Released It

I didn't flip Redis on in production blind. The rollout had two stages — QA first, then production — each with explicit acceptance criteria.

### QA Release Requirements

1. **ElastiCache server** — used the existing provisioned instance.
2. **Strapi service replica** — deployed a replica of the current Strapi service to QA.
3. **Strapi DB replica** — for consistent test data.
4. **Dedicated QA server** — Strapi base URL updated to point to the QA env.

### Environment Variable Changes

Four new variables, added at runtime:

```
REDIS_PASSWORD=<>
REDIS_HOST=<>
REDIS_PORT=<>
REDIS_USERNAME=<>
```

One existing variable updated to include the Redis host:

```
ALLOWED_CORS_ORIGIN=<>
```

### Acceptance Criteria — QA

The QA release was only signed off if all four conditions held:

1. **Response time:** API p50/p90 reduced by **at least 50%** vs. current production
2. **Memory:** Strapi pod memory **≤** current production usage
3. **Redis performance benchmarks:** stable throughput, latency, hit rate, memory usage under load
4. **Cache invalidation tests:**
   - On update
   - On deletion
   - On TTL expiry

(All four cleared comfortably — by the time QA wrapped, response time was down 90%+ on the high-volume endpoints.)

### Production Release

Same env variables, same acceptance criteria:

1. Response time reduced by ≥ 50% vs. existing prod
2. Strapi pod memory ≤ current prod usage
3. Redis (ElastiCache) demonstrates stable throughput, latency, and hit-rate under prod load

The QA pre-flight gave me confidence. The production rollout went without surprises.

---

## Cache Invalidation: The Part That Always Bites

Caching is easy. Invalidation is the part with footguns.

For CMS content like this, three invalidation paths matter:

### 1. On update (editor publishes a change)

The clean fix: **lifecycle hooks** in Strapi. On `afterUpdate` for a given collection, delete the relevant cache keys. This is tag-based invalidation in spirit — content has a tag, the tag's keys get evicted on write.

### 2. On deletion

Same pattern as update. `afterDelete` → evict keys. Skipping this leaves zombie content in the response.

### 3. On TTL expiry

Time-based fallback for everything you forgot to invalidate manually. TTLs vary by endpoint — short (seconds–minutes) for editorial content, longer (minutes–hours) for footer/navigation/legal-style data.

> The trap I've seen most often: **only using TTLs.** It looks correct because content eventually updates, but editors get a bad experience ("why isn't my edit live yet?"), and you'll get the worst of both worlds — stale content *and* unnecessary DB load.

Lifecycle hooks first, TTL as a safety net.

---

## Trade-offs I Accepted

1. **Slightly higher error rate (< 2%) under heavy load.** Worth the throughput and latency gains.
2. **A new piece of stateful infrastructure (ElastiCache) to monitor.** Standard tooling — CloudWatch metrics on hit rate, evictions, memory, CPU.
3. **An extra failure mode on writes.** If Redis is briefly unavailable, the system degrades to DB reads. The pattern: never let Redis errors propagate to users; log and bypass.
4. **Cache key discipline.** Once you have a cache, you have a place for keys to drift. I standardised key naming early so invalidation logic doesn't go stale.

---

## Key Takeaways

1. **Redis in front of a CMS is one of the highest-ROI infra changes you can make.** ~5× throughput, ~95% latency reduction, 50%+ pod/memory savings — same code, same DB.
2. **Tail latency is the headline.** The averages are nice; the p90/p95 collapsing from seconds to ~70 ms is what users actually feel.
3. **Caching is a cost story, not just a latency story.** Half the pods at the same load adds up fast on cloud bills.
4. **Lifecycle hooks beat TTLs for editorial content.** TTLs are a safety net, not a strategy.
5. **Roll out with explicit acceptance criteria.** "Latency improves by ≥ 50%" is something you can sign off; "feels faster" isn't.
6. **Hunt down outliers individually.** The heaviest endpoint needed its own treatment — most caching wins are uniform, but the awkward 5% deserves its own plan.

---

## Conclusion

Putting Redis in front of Strapi was the single largest performance win I shipped on the CMS layer — measurable in throughput (5×), in latency (95% reduction on most endpoints), and in infrastructure (half the pods, half the memory). The release was deliberately staged with QA acceptance criteria before production, which kept it boring — exactly what you want from a stateful infra change.

The general lesson: **CMS content is read-heavy and tolerates seconds of staleness — that's an exact match for Redis.** If you're running Strapi (or any headless CMS) at scale without a cache layer, the upside isn't 10% better — it's the difference between fighting your infrastructure and forgetting it's there.
