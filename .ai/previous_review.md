# Daily Repo Opportunity Scan: 2026-08-26

_No `.ai/previous_review.md` existed yet — this is a baseline scan, not a diff. No commits landed in the last 24h (latest commit `a8a69d8`, "mcp version increase", is from 2026-08-11); findings below are the current standing opportunities, prioritized fresh._

## 1. Net-New Opportunities (High Priority)

- **Upload page CSS bypasses the design-token system** (`assets/css/style.scss:573-760`, the `UPLOAD PAGE STYLES` block). The rest of the file is token-driven (`--bg-color`, `--surface-color`, `--primary-color`, etc., defined at `style.scss:10-30`), but this block hardcodes raw values instead: `.error-banner` uses `#ef5350` / `rgba(198, 40, 40, 0.2)` with no `--error-color` token defined anywhere; `.file-remove` uses literal `red`; `.btn-primary` uses literal `white`/`black` instead of `var(--text-primary)`/`var(--bg-color)`. Value unlock: a themeable, greppable palette — right now a dark-mode or brand-color change has to hunt this block separately from the rest of the stylesheet.
- **`rgba(99, 102, 241, 0.1)` (primary-color-at-10%) is duplicated three times** (`style.scss:601`, `~723`, `~731` — `.dropzone.dragging`, `.add-more-card:hover`) instead of a single `--primary-tint` token. Same value, three copies to keep in sync if the accent color ever changes.
- **Inline `style=""` on a fallback placeholder** (`_includes/generate-nav-sub-directory.html:33`): `background:#222; color:#555;` hardcoded on the "No Preview" div, invisible to the stylesheet's dark-theme tokens and to any future palette pass. Trivial to promote to a `.no-preview` class using existing `--surface-color`/`--text-secondary` vars.

## 2. Design System & UI Consistency

- Add `--error-color` / `--error-bg` tokens to the `:root` block (`style.scss:10-30`) and point `.error-banner` and any other error UI at them, matching how `--primary-color` etc. are already centralized.
- Introduce a `--primary-tint: rgba(99, 102, 241, 0.1)` token (or a `color-mix()` equivalent) and replace the three literal copies.
- Move the `_includes/generate-nav-sub-directory.html:33` inline style into a `.no-preview` class in `style.scss`.
- Everything else scanned (gallery layout, form-factor filter chips, nav includes) is consistent with the site's established Liquid + vanilla-JS + CSS-variable conventions — no new drift found there.

## 3. Status of Previous Flags

N/A — first run, no prior report to compare against. Note: `PLAN.md` already tracks an open item (auto-tagger produces shallow/generic `image_tags`) — not re-flagged here since it's already owned.

## 4. Suggested Action/Execution Plan

`claude -p "Add --error-color and --primary-tint tokens to :root in assets/css/style.scss, replace the hardcoded red/#ef5350/rgba(198,40,40,*) and repeated rgba(99,102,241,0.1) values in the UPLOAD PAGE STYLES block with them, and move the inline style on the 'No Preview' div in _includes/generate-nav-sub-directory.html into a .no-preview class"`
