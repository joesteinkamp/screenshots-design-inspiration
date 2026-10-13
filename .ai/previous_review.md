# Daily Repo Opportunity Scan: 2026-07-29

> First run — no prior `.ai/previous_review.md` existed, so this is a baseline scan, not a diff. No commits landed in the last 24h (last commit: `d49ccb0`, 2026-07-17); this is a full-repo pass instead of a delta review.

## 1. Net-New Opportunities (High Priority)

1. **Dead gallery library shipped to every page** — `assets/material-photo-gallery/` (`material-photo-gallery.js` + `.css`) is not referenced by any `_layouts` or `_includes` template (only `grid-gallery` is wired up in `_layouts/gallery.html` and `_includes/head.html`). It's unused dead weight, likely a leftover from before the `grid-gallery` migration. Value unlock: delete it, or if it was mid-migration, finish the swap — either way, stop confusing future contributors about which gallery is canonical.
2. **Two independent screenshot-tagging pipelines** — `scripts/auto-tag.mjs` (Gemini/local backend) and `mcp-server/src/tools.ts` (647 lines) both read/write the same frontmatter and tag taxonomy (`screenshot_tags.csv`) but live in separate toolchains with no shared validation. `scripts/validate-frontmatter.mjs` exists but it's unclear if the MCP server enforces the same schema before writes. Value unlock: extract a shared frontmatter schema/validator both the crawler/tagger scripts and the MCP server import, to prevent tag drift between the two write paths.
3. **`crawler/` discovery pipeline has no dedupe-vs-published check documented** — `crawler/seen.json` only tracks 35 bytes (essentially empty), and `crawler/candidates/` accumulates discovery output from `producthunt.mjs`/`hn.mjs`/`github.mjs`/`yc.mjs` sources. Worth confirming the auto-tag/publish step actually cross-references `seen.json` against already-published screenshots before promoting a candidate — a thin seen-list is a common source of duplicate publishing bugs.

## 2. Design System & UI Consistency

- No component-library layer exists yet (this is a Jekyll site, not React/Tailwind/shadcn) — the "design system" here is the `_layouts`/`_includes` + `assets/css/style.scss` (1040 lines, single monolithic stylesheet). No new hardcoded inline `style=` attributes were introduced recently (only 1 pre-existing instance in `_includes/generate-nav-sub-directory.html`), so no fresh drift to flag today.
- Suggested refactor once material-photo-gallery is confirmed dead: consolidate all gallery-rendering CSS into the `grid-gallery` bundle and split `style.scss` by concern (nav, gallery, upload/search forms) so future changes don't require scrolling a 1000+ line file.

## 3. Status of Previous Flags

- N/A — no previous review file existed. This report is the baseline; future runs should diff against this one.

## 4. Suggested Action/Execution Plan

```bash
claude -p "Confirm assets/material-photo-gallery is unreferenced anywhere in the Jekyll build output and Liquid includes, then delete it and its entry (if any) in _includes/head.html; run a full Jekyll build to confirm no regressions."
```
