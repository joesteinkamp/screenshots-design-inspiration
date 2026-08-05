# Daily Repo Opportunity Scan: 2026-08-05

No `.ai/previous_review.md` existed before this run — treated as a first pass, scoped to the form-factor filter work landed 2026-08-03/04 (PRs #78, #79, #81, #82).

## 1. Net-New Opportunities (High Priority)

1. **Combining the two form-factor toggles hides every image, including matching ones.** `assets/js/toggle-visibility.js:17-20` lets "Only Show Tablet" and "Only Show Foldable" both be active at once (each just toggles its own `only-*` class, no mutual exclusion). But `assets/css/style.scss:375-378` implements them as independent `:not()` rules — with both classes on `.grid`, a tablet image is hidden by the `only-foldable` rule (it's `:not(.foldable)`) and vice versa, so the grid goes empty instead of showing the union. Either enforce exclusivity in JS (deactivate the other chip on click, matching the "Only Show X" copy) or change the CSS to a single combined selector. Small fix, real dead-end for anyone who clicks both chips.

2. **`mark-foldable-screenshots.mjs` duplicates `mark-tablet-screenshots.mjs` almost line for line.** `scripts/mark-foldable-screenshots.mjs` (182 lines) and `scripts/mark-tablet-screenshots.mjs` (141 lines) share the same shape — walk platform dirs, read image dimensions, classify by aspect ratio, diff against frontmatter, write `--write`/report-only output — differing only in the ratio thresholds, platform scope, and frontmatter key. Third form factor added this way is a third full copy. Worth extracting a shared `scripts/lib/classify-by-shape.mjs` (platforms, ratio predicate, frontmatter key as params) before it happens again.

3. **Per-factor CSS is written out literally and the comment already flags it as a recurring cost.** `assets/css/style.scss:372-378` says outright: "Written out literally per factor... add a rule when adding a form factor." That's an accepted tradeoff today (two factors), but it's the same shape as #2 — worth a one-line note next to `form_factors:` in `_config.yml` pointing at both the SCSS block and the two mark-*.mjs scripts so the next form factor (a third is plausible — e.g. "large tablet") updates all three places instead of missing one.

## 2. Design System & UI Consistency

No new hardcoded styles or component duplication beyond what's noted above — the form-factor work reused the existing `.tablet` shape-class / grid-column pattern instead of inventing a new one, and the MCP server's `form_factor` filtering is centralized behind a single `matchesFormFactor` helper (`mcp-server/src/tools.ts`) rather than repeated per-tool. This is a Jekyll/SCSS static site (no React/shadcn component layer), so "component" drift here means the Liquid/SCSS/mjs-script triad above — that's where #2/#3 apply.

## 3. Status of Previous Flags

None — this is the first run of this scan; there's no prior report to diff against.

## 4. Suggested Action/Execution Plan

```
claude -p "Fix assets/js/toggle-visibility.js and assets/css/style.scss so the 'Only Show Tablet' and 'Only Show Foldable' gallery chips are mutually exclusive (activating one deactivates the other), per the CHANGELOG's stated 'exclusive toggle' design intent."
```
