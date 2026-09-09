# Daily Repo Opportunity Scan: 2026-09-09

No baseline found (`.ai/previous_review.md` did not exist) — this is the first
run, so it's a full-repo scan rather than a diff. No commits in the last 7
days (last commit: `076f14c`, 2026-09-01). Stack note: this is a Jekyll static
site (Ruby plugins, SCSS, vanilla JS) plus a Node crawler/MCP server — not a
React/Tailwind/shadcn app, so findings below are framed against its actual
architecture (Liquid includes, `assets/css/style.scss` design tokens, shared
Ruby/JS taxonomy modules) rather than component-library conventions.

## 1. Net-New Opportunities (High Priority)

1. **MCP server hardcodes a 4th, unsynced copy of the platform taxonomy** —
   `mcp-server/src/types.ts:5` (`PLATFORMS = ["Web", "iOS", "Android", "Email"]`)
   is a hand-maintained duplicate of `platforms:` in `_config.yml`, which is
   already the single source of truth read by both `_plugins/platforms.rb`
   and `scripts/lib/platforms.mjs`. The file's own comment admits "the two
   must be kept in step by hand." If a platform is ever added/renamed in
   `_config.yml`, the MCP server's `z.enum` silently goes stale with no build
   error. Value unlock: have `mcp-server/src/data.ts` derive `PLATFORMS` from
   the platform values actually present in the generated `api/products.json`
   (which already carries `product.platform`), removing the third
   hand-synced list entirely.

2. **Search page ships ~140 lines of bespoke inline CSS that shadows the
   global design tokens** — `_includes/search-lunr.html:122-270` embeds its
   own `<style>` block styling `#lunrsearch`, `.lunrsearchresult`, etc., using
   `var(--surface-color, #171717)`-style fallbacks that re-hardcode every
   token already declared in `assets/css/style.scss:10-46`. Since
   `style.css` is always loaded in `<head>` before this partial renders, the
   fallback values are dead code that will silently drift the moment someone
   updates a token in `style.scss` without remembering this file. Value
   unlock: move this block into `assets/css/style.scss` as a `.lunr-search`
   component section and drop the include down to markup only — one styling
   surface for the whole site instead of two.

## 2. Design System & UI Consistency

- Same finding as above (search page): the rest of the site's chrome
  (header, nav, gallery grid, filter chips) is styled centrally in
  `assets/css/style.scss` against the `:root` custom properties — the search
  page is the only page that breaks this pattern with page-scoped inline
  CSS. Suggested refactor: fold `_includes/search-lunr.html`'s `<style>`
  block into `style.scss` under a `.lunr-search` namespace, referencing the
  tokens directly (no hardcoded fallbacks) so it repaints correctly if the
  theme ever changes.
- No new hardcoded hex colors were found outside `style.scss` other than the
  ones already inside the search-lunr block noted above, and one small inline
  `style="..."` in `_includes/generate-nav-sub-directory.html:33` (a "No
  Preview" placeholder box) — low priority, but could become a `.no-preview`
  utility class in `style.scss` if another placeholder like it shows up.

## 3. Status of Previous Flags

No previous review exists — nothing to carry forward. Tag-quality work
already tracked in `PLAN.md` ("Improve screenshot tag quality") is
intentionally excluded here since it's already an open, known item, not a
new finding.

## 4. Suggested Action/Execution Plan

```
claude -p "Derive mcp-server/src/types.ts PLATFORMS from the distinct product.platform values in api/products.json instead of hand-listing them, and add a build-time check that fails if it ever diverges from _config.yml's platforms: list"
```
