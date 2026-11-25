# Daily Repo Opportunity Scan: 2026-11-25

> Baseline run: there was no previous `.ai/previous_review.md`, and nothing has been committed in 44 days (last commit `c2000d1`, 2026-10-12). Every finding below is new and comes from the current state of the repo. Stack note: this is Jekyll + SCSS custom properties + vanilla JS, with a TS MCP server, so there is no React, Tailwind or shadcn/ui. "Design system" here means the tokens in `assets/css/style.scss`.

## 1. Net-New Opportunities (High Priority)
1. **The MCP server keeps its own copy of the platform list.** `mcp-server/src/types.ts:5` hardcodes `PLATFORMS = ["Web","iOS","Android","Email"]`. `_plugins/platforms.rb` and `scripts/lib/platforms.mjs` both read it from `_config.yml` (`platforms:`) and fail loudly if it's missing. If a platform is added to config, the MCP `z.enum` will silently reject it. **Unlock:** one source of truth for the taxonomy. Generate the enum at build time from `_config.yml`, or derive it from the platforms in the loaded `data.ts` payload.
2. **Unused vendor assets.** `assets/material-photo-gallery/` (1,847-line JS plus an empty CSS file) is not referenced by any layout, include or page. `assets/grid-gallery/grid-gallery.min.{js,css}` are 0-byte files. **Unlock:** less to ship and less to maintain, and no confusion about which lightbox is the real one. Delete them.
3. **Stray top-level `Marketing/` directory.** It holds a single PNG, and `Marketing` is not in `_config.yml` `platforms:`, so no build step, validator or MCP tool ever sees it. **Unlock:** either make it a proper platform (config, plus `<Product>/index.html` with `layout: gallery`) or move it under `Web/`.

## 2. Design System & UI Consistency
- **Two competing token systems.** `assets/grid-gallery/grid-gallery.css:1-18` defines its own palette (`--main-color`, `--txt-color`, `--backdrop-color`, etc., light by default with a `data-theme="dark"` swap). `style.scss:410-560` then overrides `.gg-*` selectors on top of it. **Refactor:** point the grid-gallery variables at the site tokens (`--main-color: var(--text-primary)`, `--backdrop-color: var(--glass-bg)`, `--img-bg-color: var(--surface-color)`) and drop the duplicate `.gg-*` overrides from `style.scss`.
- **Hardcoded raw RGBA values.** `style.scss:224-225` uses `rgba(99,102,241,…)`, which duplicates `--primary-color` (#6366f1). **Refactor:** add a `--primary-rgb: 99 102 241` token and use `rgb(var(--primary-rgb) / .3)`.
- `_includes/generate-nav-sub-directory.html` has one inline `style=` attribute. Move it into a class.

## 3. Status of Previous Flags
- None. This is the first run and sets the baseline for tomorrow's diff.

## 4. Suggested Action/Execution Plan
```bash
claude -p "Make _config.yml 'platforms:' the single source for mcp-server: replace the hardcoded PLATFORMS in mcp-server/src/types.ts with a list generated at build time (prebuild script reading ../_config.yml via js-yaml, mirroring scripts/lib/platforms.mjs fail-loud behavior), keep z.enum typing, then delete assets/material-photo-gallery/ and the 0-byte grid-gallery.min.* files; run the mcp-server build to verify."
```
