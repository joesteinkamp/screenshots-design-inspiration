# Daily Repo Opportunity Scan: 2026-10-14

_Baseline run: no prior `.ai/previous_review.md` existed. Stack is Jekyll/Liquid + vanilla JS/SCSS (no React/Tailwind/shadcn). Last 24h: no commits; most recent are Manus/Gemini gallery adds (#108–#111)._

## 1. Net-New Opportunities (High Priority)
- **Lazy-load gallery media** — `_layouts/gallery.html:~95,106`: gallery `<img>` has no `loading="lazy"`/`decoding="async"`, and every `<video autoplay>` has no `preload`, so a page like `Web/Hey` (23 MP4s) or `Android/ChatGPT` (~50 PNGs) fetches everything on load. Add `loading="lazy" decoding="async"` to imgs (the nav card already does this, `generate-nav-sub-directory.html:17`) and `preload="none"` + IntersectionObserver play/pause for videos. Largest perf win per line changed.
- **Repo weight is 2.9 GB `.git`** — binary screenshots/MP4s (115 videos) committed directly; new galleries (Manus 11 MB, Gemini 5 MB) keep adding. Move media to Git LFS or object storage/CDN, and add a size guard to `.github/workflows/pr-validate.yml` (fail >N MB/file).
- **Alt text is a constant** — `alt="image"` / `alt="video"` in `_layouts/gallery.html`. Generate from `gallery-directory` + first image tag (data already in `image_tags`) for a11y and search.

## 2. Design System & UI Consistency
- Inline/per-page styles bypass `assets/css/style.scss`: `<style>` blocks in `_includes/search-lunr.html:122` and `upload.html:7`, and a hardcoded inline-styled "No Preview" fallback (`#222/#555`) in `_includes/generate-nav-sub-directory.html:33`. Move to SCSS partials using the existing CSS variables; add a `.card-placeholder` class.
- Media-type handling (img vs video) is duplicated by extension checks in the layout; extract `_includes/media-item.html`.

## 3. Status of Previous Flags
No previous report; nothing to compare. (`CHANGELOG.md` shows no outstanding flagged items.)

## 4. Suggested Action/Execution Plan
`claude -p "In _layouts/gallery.html add loading=lazy decoding=async to gallery <img>, preload=none + IntersectionObserver autoplay for <video>, and derive alt text from gallery-directory and image_tags; verify with jekyll build"`
