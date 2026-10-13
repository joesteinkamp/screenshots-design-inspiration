# Daily Repo Opportunity Scan: 2026-09-30

*Baseline run: no prior `.ai/previous_review.md` existed. No commits in the last 24h (latest: 076f14c, 2026-09-01). Stack is Jekyll + vanilla JS + SCSS tokens (no React/Tailwind/shadcn), so "design system" = `assets/css/style.scss` CSS variables.*

## 1. Net-New Opportunities (High Priority)
1. **Unescaped input into `innerHTML` in search** — `_includes/search-lunr.html:53` interpolates raw `term` (from the URL query) into HTML; result rows (l.46) concatenate title/url/tags the same way. Reflected XSS + broken rendering on `'`/`<`. Fix: build nodes with `textContent`/`createElement` or one `escapeHtml()` helper.
2. **Inline page CSS bypasses the SCSS pipeline** — `_includes/search-lunr.html:122` and `upload.html:7` ship `<style>` blocks (upload's comment admits "if main css update lags"). Moving both into `assets/css/style.scss` (partials) gives one cache-able stylesheet and single source of truth for tokens.

## 2. Design System & UI Consistency
- `search-lunr.html` repeats every token's hex as a `var(--x, #hex)` fallback (`#171717`, `#262626`, `#a1a1aa`, `#6366f1`, `#4f46e5`) plus raw `#fff` / `rgba(255,255,255,0.1)`. Drop fallbacks (tokens are always defined in `style.scss`); add `--border-subtle` and `--text-on-primary` tokens for the raw values.
- `#ef5350` appears once outside the token set — promote to `--danger-color`.
- Vendored `assets/grid-gallery/` and `assets/material-photo-gallery/` keep both `.js` and `.min.*` copies; pick one and delete the other to avoid drift.

## 3. Status of Previous Flags
No previous report; nothing to compare. `PLAN.md` item (controlled-vocabulary tag quality) remains open and is unchanged.

## 4. Suggested Action/Execution Plan
`claude -p "In _includes/search-lunr.html replace innerHTML string concatenation with escaped DOM construction, then move its <style> block into assets/css/style.scss using existing CSS variables"`
