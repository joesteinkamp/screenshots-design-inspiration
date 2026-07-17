# Product candidate crawler

A **discovery-only** crawler that surfaces newly-launched products worth adding
to the gallery. It runs weekly (and on demand) as a GitHub Action, dedupes
against the products already here, and opens a PR with a candidate manifest for
a human to review.

**What it does _not_ do — by design:**

- It never takes or commits screenshots. The gallery's value is *self-captured,
  in-app* screenshots; a human adds those through the normal
  [contribution flow](../CONTRIBUTING.md) after reviewing candidates.
- It never reuses a source's images. Third-party screenshots are copyrighted.
  The crawler only reads product **names + URLs** (facts, not copyrightable).
- It never commits to `master` or touches gallery folders. Its only outputs are
  `crawler/candidates/<date>.md` and `crawler/seen.json`, so the existing
  auto-tagger and `pr-validate.yml` are unaffected.

## Sources

All sources are token-free or use the built-in `GITHUB_TOKEN`, and all are used
in a way their terms permit (public APIs / published feeds, no site scraping).

| Source | How | Yields |
|--------|-----|--------|
| **Y Combinator** | `yc-oss/api` daily JSON (most recent batches) | company name + website |
| **Hacker News "Show HN"** | Algolia HN Search API | launch title + product URL |
| **GitHub** | Search API (recent, well-starred repos with a homepage) | repo name + homepage |
| **Product Hunt** | Public **RSS feed** (`/feed`) | product name + tagline + PH post link |

### Deliberately excluded

- **Mobbin** — has no free API, sits behind a login wall, and its ToS bans
  scrapers/bots/crawlers and automated access **of any kind**, so even
  name-only discovery isn't permitted for an unattended job. (A paid official
  API/MCP exists; not used here.) Browse it manually as a human reference
  instead.
- **Awwwards, Godly, Land-book, SiteInspire** — ToS-protected curated galleries
  with no sanctioned automated access; their whole product is the curated image
  set.
- **BetaList, Peerlist, Indie Hackers** — no clean public API (scrape-only).

Product Hunt's GraphQL API is intentionally avoided in favor of its RSS feed:
the API needs a token and carries a non-commercial clause, while the feed is a
published, structured document meant for automated consumption.

## Usage

```bash
# Preview without writing anything (great for local checks):
node scripts/crawl-candidates.mjs --dry-run

# A subset of sources:
node scripts/crawl-candidates.mjs --sources hn,yc --limit 10

# Full run (what CI does):
node scripts/crawl-candidates.mjs --sources yc,hn,github,producthunt --limit 15
```

npm shortcuts: `npm run crawl` and `npm run crawl:dry-run`.

## How dedupe works

A candidate is dropped if its normalized name matches an existing gallery
folder (folder names equal the `gallery-directory` frontmatter, so they are the
catalog), or if its name/domain was already surfaced in a previous run.
Previously-surfaced names and domains are persisted in
[`seen.json`](seen.json) — committed by the crawler's own PR — so the same
candidates don't reappear whether or not they were ultimately added.

## Layout

```
crawler/
  README.md              # this file
  seen.json              # persisted dedupe state (names + domains)
  candidates/<date>.md   # one manifest per run
scripts/
  crawl-candidates.mjs   # engine: fetch → normalize → dedupe → cap → write
  sources/
    util.mjs             # fetch + retry + text helpers
    yc.mjs  hn.mjs  github.mjs  producthunt.mjs
```
