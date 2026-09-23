# Daily Repo Opportunity Scan: 2026-09-23

*First run — no `previous_review.md` existed yet, so this is a full baseline rather than a diff. No commits landed in the last 24h (latest commit `076f14c`, 2026-09-01), so "net-new since yesterday" is empty; findings below are the standing opportunities in the current tree.*

## 1. Net-New Opportunities (High Priority)

- **Dead gallery library still shipping to every page.** `assets/material-photo-gallery/material-photo-gallery.js` (1,847 lines) + its CSS are committed but never referenced by any layout/include — the site only wires up `assets/grid-gallery/*` (`_layouts/gallery.html`, `_includes/head.html`). Confirmed via `grep -rl "material-photo-gallery" _layouts _includes .` returning nothing. Value unlock: delete it, or if it's a planned replacement, note that in PLAN.md so it doesn't read as orphaned code.
- **One-off component framework with no home.** `upload.html:20-33` bootstraps Preact + htm from CDN (`esm.sh/preact`) purely for the upload form — the only reactive/component-based UI in an otherwise vanilla-JS + Jekyll-include site. `_includes/search-lunr.html` (283 lines) solves a similarly stateful problem (query input, live results, filters) with imperative `document.getElementById`/manual DOM writes instead. Value unlock: since Preact+htm is already a proven, zero-build pattern here, it's the natural target for the search UI's next iteration rather than growing more imperative JS in `search-lunr.html`.
- **Redundant scaffolding for crawl candidates.** `crawler/` (README + `seen.json` + empty `candidates/`) duplicates the role of `scripts/crawl-candidates.mjs` + `scripts/sources/*.mjs`, which appear to be the actual, actively maintained crawler (per `package.json`'s `crawl` script). Worth confirming `crawler/` isn't stale scaffolding from an earlier iteration before someone edits the wrong one.

## 2. Design System & UI Consistency

- `_includes/search-lunr.html:122-180` hardcodes an entire `<style>` block with fallback hex values (`#171717`, `#ffffff`, `#6366f1`, `12px`) that are exact duplicates of the tokens already defined in `assets/css/style.scss:10-40` (`--surface-color`, `--text-primary`, `--primary-color`, `--radius-md`). Since `style.scss` is compiled and linked in `<head>` before any include renders, the `var(--x, fallback)` pattern here is unnecessary — it's copy-pasted defensive CSS that will silently drift from the real tokens the next time someone updates `:root`. Refactor: drop the block, move the handful of search-specific selectors into `style.scss` (or a partial), and reference tokens directly without fallbacks.
- `upload.html:7-13` has its own scoped `<style>` block (with a comment acknowledging it's a workaround "in case main css update lags"). Low priority, but it's the same pattern as above — a page-local style escape hatch that should fold into the main stylesheet once confirmed stable.

## 3. Status of Previous Flags

N/A — no prior review exists. Establishing baseline today.

## 4. Suggested Action/Execution Plan

`claude -p "Delete the unused assets/material-photo-gallery directory (verify with grep -rl 'material-photo-gallery' across _layouts, _includes, and all HTML first), then run the site build to confirm nothing references it."`
