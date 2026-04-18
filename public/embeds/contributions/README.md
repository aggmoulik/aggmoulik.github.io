# Contributions Widget — Static Fallback

The portfolio now embeds the contributions widget in **live API mode** —
see `src/components/sections/contributions.astro`. The widget script is
served from `https://github-embed-ui.qwertymoulik.workers.dev/widget.js`
and data is fetched from `/api/embed/<id>` at render time.

This directory holds the **legacy static export** as a fallback. Files
here are no longer loaded unless the Astro component is reverted to
`data-src` mode.

## Files (fallback only)

| File | Purpose |
|---|---|
| `widget.js` | Last exported widget bundle (Shadow DOM Preact) |
| `widget-data.json` | Last exported PR snapshot |
| `.embed-manifest.json` | Export metadata: timestamp, widget id, version |

## How to refresh data (current — live mode)

1. In the `github-embed-ui` repo: `pnpm dev`
2. Sign in and trigger a GitHub sync — writes go to **production** Turso
   (because dashboard `.env` points at `libsql://...turso.io`)
3. Cached responses on the worker invalidate after 5 min — new PRs appear
   on the portfolio without a redeploy

## How to revert to static mode

If the worker is down or you need offline embed:

```bash
# In github-embed-ui
pnpm export:widget \
  --widget-id 059b1689-4ddd-4b74-acd6-62a604f55512 \
  --out ../aggmoulik.github.io/public/embeds/contributions
```
