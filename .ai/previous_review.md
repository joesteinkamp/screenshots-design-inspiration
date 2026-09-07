# Daily Repo Opportunity Scan: 2026-07-15

_No `.ai/previous_review.md` existed prior to this run, and there have been no commits in the last 24 hours (HEAD `497b8cb`, 2026-05-22). This is a baseline full-repo scan rather than a diff against a prior report._

## 1. Net-New Opportunities (High Priority)

1. **Unescaped string concatenation into `innerHTML` in search results** — `_includes/search-lunr.html:46` (and lines 12–14, 53, 63) builds result markup via raw string concatenation (`"<span class='title'>" + displayTitle + ...`) instead of DOM APIs or an escaping helper. `displayTitle`/`gallerydirectory`/`tags` originate from product frontmatter (`gallery-directory`, `tags`), which `scripts/auto-tag.mjs:171` populates directly from a human-supplied `productName` during the new-product workflow. Any stray `<`/`>` in a product name or free-text tag renders as live HTML in every visitor's search results. Fix: switch to `textContent`/`createElement` construction or add a small `escapeHtml()` helper before interpolation — cheap, high-value, and prevents a real markup-injection class of bug as more products get added.

2. **Public upload flow has no server-enforced limits** — `upload.html` / `assets/js/upload.js` lets anyone upload up to 100 files (5MB each) directly to Firebase Storage with no auth. The 100-file/5MB checks (`assets/js/upload.js:83-113`) are client-side only. No `storage.rules` file is checked into the repo and `firebase.json` has no `storage` key, so there's no way to verify from source control whether server-side rules actually enforce size/type/rate limits, or whether they even exist. Given this is the site's only public write path, get `storage.rules` under version control (and Firebase config's `storage` key wired to deploy them) so limits are enforced server-side and reviewable, not just decorative client checks.

3. **Second, disconnected front-end architecture for one page** — `upload.html`/`upload.js` loads Preact + htm live from `esm.sh` and renders the entire upload UI as a client-rendered component tree, while the rest of the site (`_includes/*.html`, `assets/js/toggle-visibility.js`, `search-lunr.html`, grid-gallery) is server-rendered Liquid + plain DOM JS. This is the only page in the codebase with a component framework, a CDN runtime dependency, and no test coverage. Worth a deliberate call: either this is the intended pattern for future interactive pages (document it, e.g. in `CONTRIBUTING.md`), or it should be the exception it currently looks like — in which case reducing its surface (vanilla JS, matching the rest) removes a second mental model contributors have to hold.

## 2. Design System & UI Consistency

- `upload.html:8-13` ships a scoped inline `<style>` block defining `.upload-container`, even though `assets/css/style.scss` already owns styling for the rest of the upload UI (`.upload-wrapper` at line 528, `.dropzone` at 542, `.btn-primary`/`.btn-secondary` at 688–722). This is a small but clear instance of the exact drift the design system should prevent: one class living outside the SCSS pipeline "just in case." Move `.upload-container` into `style.scss` alongside its siblings and drop the inline block.
- No other new hardcoded-style or duplicate-component instances found — the rest of the gallery/search/nav templates consistently reuse the existing `_includes` partials and SCSS classes.

## 3. Status of Previous Flags

No prior report exists to diff against — nothing to carry forward. Note for future runs: `_plugins/gallery_images.rb` already contains a deliberate perf optimization (grouping `site.static_files` by directory once instead of rescanning ~10k files per gallery page) — worth confirming this pattern doesn't regress if the generator is touched.

## 4. Suggested Action/Execution Plan

`claude -p "Escape displayTitle, gallerydirectory, tags, and body before interpolating them into innerHTML in _includes/search-lunr.html (lines ~9-48); add a small escapeHtml() helper and use it everywhere user-derived frontmatter is rendered into search results."`
