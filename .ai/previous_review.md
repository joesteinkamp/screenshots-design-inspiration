# Daily Repo Opportunity Scan: 2026-09-16

_First run: no `.ai/previous_review.md` existed yet, so this is a full baseline scan rather than a diff. No commits landed in the last 24h (last commit `076f14c`, Sep 1) — findings below come from the current state of the whole repo._

## 1. Net-New Opportunities (High Priority)

1. **Hardcoded accent-color rgba values instead of a token** — `assets/css/style.scss` re-derives `rgba(99, 102, 241, …)` (the value of `--primary-color`) as a literal at least 8 times (lines 224, 401, 606, 731, 752, 766, 938, 941, 977) for hover glows, active states, and glass tints. Any future rebrand (new accent hue) requires a manual find/replace instead of touching one variable. Add a `--primary-color-alpha` (or use `color-mix(in srgb, var(--primary-color) 20%, transparent)`) and swap these call sites.
2. **Card hover-preview logic lives inline in a Jekyll include, not in `assets/js`** — `_includes/generate-nav-sub-directory.html:47-61` defines a global `setGalleryImage()` in an inline `<script>` tag and wires it via `onmouseenter="…"` attributes on every hover-zone `<div>`, while `assets/js/` already holds `upload.js` and `toggle-visibility.js` for the rest of the site's interactivity. This is the only interactive behavior not colocated with the other scripts, making it easy to miss when auditing JS or adding CSP headers later. Move it to `assets/js/product-card-preview.js` and bind listeners in JS instead of inline attributes.
3. **~20 `.DS_Store` files are tracked in git despite being gitignored** — `.gitignore` lists `.DS_Store` (lines 2 and 30, itself a duplicate entry), but files like `Web/Github/.DS_Store`, `Web/FactSet/.DS_Store`, `_layouts/.DS_Store`, etc. were committed before the rule existed and still sit in the tree, adding noise to `git status`/diffs for anyone on macOS. One-time cleanup, see Section 4.

## 2. Design System & UI Consistency

- **Duplicated gradient-text treatment**: the `background-clip: text` gradient trick is copy-pasted in two places — `header h1 a` (style.scss:106-112) and `.page-header h1` (style.scss:177-186) — with slightly different font sizes but identical background/clip/fill declarations. Extract a `.text-gradient` utility class and apply it in both spots so future gradient tweaks are one edit, not two.
- **Inline styles instead of a class**: the "No Preview" fallback in `_includes/generate-nav-sub-directory.html:33` uses a raw `style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#222; color:#555;"` attribute — the only inline style in the templates. Promote it to a `.no-preview` class in `style.scss` alongside the other card-preview rules.
- Minor: a duplicated `/* HERO / INTRO */` comment appears back-to-back at `style.scss:155-156` — harmless but worth squashing during the token cleanup above.

## 3. Status of Previous Flags
No previous report exists — this is the baseline. Note for future comparisons: `PLAN.md` already tracks a known, self-identified item (noisy/shallow `image_tags` from the auto-tagger) — that is pre-existing team-flagged debt, not a new finding, and should stay out of future "net-new" sections unless it regresses.

## 4. Suggested Action/Execution Plan
```bash
git rm --cached .DS_Store Email/.DS_Store Web/.DS_Store "Web/AlphaSense/.DS_Store" "Web/BamSEC/.DS_Store" "Web/Bipsync/.DS_Store" "Web/Bloomberg Terminal/.DS_Store" "Web/Capital IQ/.DS_Store" "Web/Catalant/.DS_Store" "Web/FactSet/.DS_Store" "Web/Github/.DS_Store" "Web/Heroku/.DS_Store" "Web/LinkedIn/.DS_Store" "Web/NVivo/.DS_Store" "Web/Navigator/.DS_Store" "Web/New Relic/.DS_Store" "Web/P2/.DS_Store" "Web/Sentieo/.DS_Store" "Web/UNCATEGORIZED/.DS_Store" "Web/Value Investors Club/.DS_Store" "_layouts/.DS_Store" "assets/.DS_Store" && git commit -m "Remove tracked .DS_Store files now covered by .gitignore"
```
