# Daily Repo Opportunity Scan: 2026-10-21

## 1. Net-New Opportunities (High Priority)
- **Dead vendored library:** `assets/material-photo-gallery/` (54 KB JS + CSS) is referenced nowhere (layouts, includes, SCSS). Only `assets/grid-gallery/` is loaded. Delete it; removes unused third-party code from the repo.
- **Search is client-side lunr over a 2,978-line vendored `assets/js/lunr.js` plus 283 lines of inline script in `_includes/search-lunr.html`.** Gallery count (440 `index.html`) is growing, so the index is rebuilt on every page load. Move to a prebuilt index (Jekyll plugin or `scripts/` step emitting `search-index.json`) and extract the inline script into `assets/js/search.js`.
- **Repo weight:** `.git` is 2.9 GB, `Web/` 1.7 GB, `iOS/` 1.3 GB. A 99 MB `.mov` was only just removed (#111) but remains in history. Consider Git LFS or an external media bucket for `.png`/`.mp4`, and a history prune for removed videos.

## 2. Design System & UI Consistency
- Tokens are well centralized as CSS variables in `assets/css/style.scss`, but 9 hardcoded hex values remain outside the `:root` block. Replace them with `var(--…)` tokens.
- Inline `<script>` blocks in `_layouts/gallery.html` (4) and `upload.html` (2) bypass the `assets/js/` pattern. Move them to files.
- `grid-gallery.css` is loaded separately from `style.scss`. Fold it into the SCSS partials to drop one request and match the token system.

## 3. Status of Previous Flags
No previous review on file (`.ai/previous_review.md` did not exist). Baseline established today. No commits in the last 24h (latest: c2000d1, 2026-10-12, Manus gallery).

## 4. Suggested Action/Execution Plan
`git rm -r assets/material-photo-gallery && git commit -m "chore: remove unused material-photo-gallery asset"`
