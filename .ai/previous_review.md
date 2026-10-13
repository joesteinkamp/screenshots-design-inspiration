# Daily Repo Opportunity Scan: 2026-10-07

*Baseline run: no prior `.ai/previous_review.md` existed. Last commit is 2026-09-01 (`076f14c`, recency-plugin fix); nothing changed in the last 24h.*

## 1. Net-New Opportunities (High Priority)
- **Dead vendored code**: `assets/material-photo-gallery/` (1,847-line JS + CSS) has no references in `_layouts/`, `_includes/`, or root pages. Gallery rendering uses `assets/grid-gallery/`. Delete it to cut repo and deploy weight and remove a confusing second lightbox implementation.
- **Duplicate minified assets**: `assets/grid-gallery/` ships both `.js`/`.css` and `.min.*`, but only the unminified files are referenced (`_layouts/gallery.html:143`, `_includes/head.html:18`, `index.html:67`). Either reference the `.min` files in production or drop them.

## 2. Design System & UI Consistency
- `_includes/search-lunr.html:122` and `upload.html:7` embed page-level `<style>` blocks. They also use hardcoded fallbacks (`#171717`, `rgba(255,255,255,0.1)`) next to `var(--surface-color)`. Move both into `assets/css/style.scss` and use the existing `:root` tokens with no literal fallbacks, so theming stays in one file.
- `style.scss` is a 1,097-line monolith. Split into partials (`_tokens`, `_gallery`, `_search`, `_upload`) when it is next touched.

## 3. Status of Previous Flags
No previous report. Nothing to compare.

## 4. Suggested Action/Execution Plan
`git rm -r assets/material-photo-gallery && grep -rn "material-photo" . --exclude-dir=.git` (confirm no references, then commit).
