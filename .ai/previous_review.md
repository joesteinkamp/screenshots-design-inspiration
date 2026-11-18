# Daily Repo Opportunity Scan: 2026-11-18

> Baseline run. No prior `.ai/previous_review.md` existed, and nothing has been committed in the last 24h (last commit `c2000d1`, 2026-10-12). Everything below is a first-pass inventory to diff against from now on.

## 1. Net-New Opportunities (High Priority)
1. **Reflected XSS in search.** In `_includes/search-lunr.html`, `?q=` is read via `URLSearchParams` and interpolated raw into `innerHTML` (`"Search results for '" + term + "'"`). Result titles, bodies, and tags are also concatenated unescaped. Fix: use `textContent` or a small `esc()` helper, and build the results list with a `DocumentFragment` in place of `innerHTML +=` inside the loop, which is O(n²) re-parsing. **Value:** closes a link-shareable script-injection hole on the public site and makes search render faster.
2. **Tag data stored three times.** All 434 galleries hold the same tags in both `image_tags:` front matter and a sibling `tags.json`. `_plugins/products_json.rb:94` falls back between the two, and `screenshot_tags.csv` (175 rows, last touched 2026-04-18) is a third, stale copy that `auto-tag.mjs`, `validate-frontmatter.mjs` and `pr-comment.mjs` still use. Fix: keep `tags.json` as the only source, have the Jekyll plugin inject it into the page, and remove the front-matter copy and the CSV. **Value:** one write path for the auto-tagger and the MCP server (`mcp-server/src/data.ts`), so the copies can't drift.
3. **81 MP4s have no tags or platform info.** In `_layouts/gallery.html`, the `mp4` branch hardcodes `class="media web"` and never looks up `image_tags`. Videos from iOS or Android galleries get web geometry and don't respond to the platform filter chips. Recent galleries (Manus, Gemini) are increasingly video-first. Fix: give videos the same `img_platform`, `shape` and tag-overlay logic that images get. Extract it into `_includes/media-card.html` so both share one card.

## 2. Design System & UI Consistency
- **Token bypass:** `assets/css/style.scss` defines tokens on `:root`, but about 27 raw `rgba()` values skip them. Indigo `rgba(99,102,241,…)` alone appears 7 times; there are also scrim blacks (0.6–0.85) and the error red `#ef5350`/`rgba(198,40,40,…)`. Add `--primary-rgb`, `--scrim-strong/weak`, `--border-subtle` and `--danger` tokens, then replace the raw values.
- **Inline style:** `_includes/generate-nav-sub-directory.html:33` hardcodes the "No Preview" tile (`#222`/`#555`) inline. Move it to a `.preview-empty` class that uses surface tokens.
- **Second palette:** `assets/grid-gallery/grid-gallery.css` has 10 hardcoded colors from its own vendor palette. Map them to site tokens, since the gallery is invoked with `darkMode: true` anyway.
- **Dead library:** `assets/material-photo-gallery/` (54 KB JS plus CSS) is referenced nowhere, and the `grid-gallery.min.{js,css}` files are unused too (the unminified versions are what loads). Delete them.

## 3. Status of Previous Flags
- N/A. This is the first report; there is no prior baseline.
- Still open from `PLAN.md`: the auto-tagger vocabulary rewrite in `scripts/auto-tag.mjs` has not started.
- Hygiene: 22 `.DS_Store` files are tracked despite `.gitignore`. Run `git rm --cached`.

## 4. Suggested Action/Execution Plan
```bash
claude -p "In _includes/search-lunr.html, escape the query and all doc fields (title, url, body, tags) before rendering, replace innerHTML += in renderResults with DOM nodes/DocumentFragment and textContent, and verify /search/?q=<img src=x onerror=alert(1)> renders as literal text."
```
