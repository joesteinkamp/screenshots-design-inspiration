# Daily Repo Opportunity Scan: 2026-11-04

*Baseline run: no prior `.ai/previous_review.md` existed. No commits in the last 24h (latest: 2026-10-12, #111). Findings below are from a full-repo scan.*

## 1. Net-New Opportunities (High Priority)
- **Single-source the MCP version** — `mcp-server/src/index.ts:9` hardcodes `"1.1.1"`, duplicating `mcp-server/package.json`. #109 was a version-sync fix, so drift has already happened once. Read it from package.json at build time (or a generated constant) to remove the manual step.
- **Gallery page has no component boundary** — `_layouts/gallery.html` (153 lines) mixes platform chips, form-factor chips and grid in one file, with filter behavior split across `assets/js/toggle-visibility.js` and `style.scss` (`.grid.only-*`). Extract `_includes/filter-chips.html` so the chip markup/JS contract lives in one place before more filters (e.g., tags) are added.

## 2. Design System & UI Consistency
- `_includes/search-lunr.html:139-267` declares ~17 inline `var(--token, #hex)` fallbacks. The tokens already exist in `assets/css/style.scss:12-19`, so the fallbacks are duplicate hex values to keep in sync. Move the `<style>` block into `style.scss` (partial) and drop the fallbacks.
- `assets/css/style.scss:581` uses a raw `#ef5350` and `search-lunr.html:168` a raw `#fff`. Add `--danger-color` and `--on-primary` tokens.
- `assets/grid-gallery/grid-gallery.css:2-15` defines its own `--main-color` / `--secondary-color` / `--txt-color` palette, separate from the site tokens. Alias them to `--bg-color` / `--surface-color` / `--text-primary`. The theme is dark-only (no `prefers-color-scheme` handling), so the vendored light variant is effectively dead.
- Vendored `material-photo-gallery.js` (1,847 lines) and `lunr.js` (2,978 lines) are committed unminified. Consider loading lunr from a pinned CDN or npm build to shrink the diff surface.

## 3. Status of Previous Flags
None (first run).

## 4. Suggested Action/Execution Plan
`claude -p "In _includes/search-lunr.html, move the <style> block into assets/css/style.scss, drop the hex fallbacks in var(), and add --danger-color/--on-primary tokens replacing #ef5350 and #fff"`
