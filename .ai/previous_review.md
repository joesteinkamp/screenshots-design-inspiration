# Daily Repo Opportunity Scan: 2026-07-22

_No `.ai/previous_review.md` exists on `master` — the prior run's report only
ever landed in an unmerged PR (#63, opened 2026-07-15, still open). This scan
diffs against that PR's content since it's the only real baseline. The full
delta on `master` since PR #63's base commit is exactly one feature: the
product-candidate crawler (`scripts/crawl-candidates.mjs` + `scripts/sources/*`,
merged via #62) — no gallery, template, or style files changed._

## 1. Net-New Opportunities (High Priority)

1. **Crawler's domain-dedup will silently kill the `github` source and
   cross-collide unrelated products** — `scripts/crawl-candidates.mjs:83-90`.
   `domainOf()` reduces every URL to its last two hostname labels to catch
   `app.foo.com` vs `foo.com` as the same product. That heuristic breaks on
   two real inputs already seen in the crawler's first live run (PR #66):
   `https://github.com/houtini-ai/seo-audit-console` → `github.com`, and
   `https://joinflipside.com.au/repair/` → `com.au`. Once `crawler/seen.json`
   from #66 merges, `github.com` is a permanently "seen" domain — every future
   candidate from the `github` source (any org, any repo) collapses to the
   same string and gets deduped away, effectively disabling that source from
   the second run onward. The same collapse happens for any future `*.com.au`,
   `*.co.uk`, `*.co.nz`-style product, wrongly merging unrelated companies.
   Fix: special-case multi-part public suffixes (`co.uk`, `com.au`, `github.com`,
   `github.io`, etc.) or pull in a small public-suffix list rather than a fixed
   "last two labels" rule.

## 2. Design System & UI Consistency

No new deviations — the only change since the last review is backend/tooling
(the crawler), which touches no templates, SCSS, or client JS.

## 3. Status of Previous Flags

All three items from PR #63 (2026-07-15) remain open and unfixed on `master`,
and that PR itself was never merged:

- **Unescaped `innerHTML` in search results** (`_includes/search-lunr.html`,
  e.g. line 46) — still builds result markup via raw string concatenation of
  frontmatter-derived `displayTitle`/`gallerydirectory`/`tags`. Still exploitable
  by a stray `<`/`>` in a product name or tag. Unfixed for a week.
- **No `storage.rules` in version control** — `firebase.json` still has no
  `storage` key; the public upload flow's 100-file/5MB limits
  (`assets/js/upload.js`) are still enforced client-side only, unverifiable
  from source.
- **`upload.html`'s inline `<style>` + Preact/htm-from-CDN architecture** —
  still the only page with a component framework and a CDN runtime dependency;
  `.upload-container` is still defined inline instead of in `style.scss`.

## 4. Suggested Action/Execution Plan

`claude -p "Fix domainOf() in scripts/crawl-candidates.mjs (~line 83) so multi-part public suffixes like github.com, com.au, and co.uk aren't treated as a single registrable domain — special-case a short list of known multi-label suffixes (or use a public-suffix-list package) instead of always taking the last two hostname labels."`
