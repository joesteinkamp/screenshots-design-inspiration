# Change Log

Decisions behind AI-made changes to this repo — what changed, what prompted it,
why this approach, and what was considered and rejected.

## 2026-08-03 — Added a `foldable` form-factor flag for Android galleries

- **What:** New `scripts/mark-foldable-screenshots.mjs` classifies Android
  screenshots as foldable by resolution (near-square: short/long edge ratio
  ≥ 0.72, short edge ≥ 800px) and writes a `foldable_images:` frontmatter list.
  The gallery layout (`_layouts/gallery.html`) and SCSS (`assets/css/style.scss`)
  give those images the wider tablet-style column instead of the narrow phone
  column. `foldable_images` was added to the frontmatter key-order lists in
  `scripts/mark-tablet-screenshots.mjs` and `scripts/auto-tag.mjs` so re-tagging
  preserves its position. Applied to 43 existing foldable captures across 7
  products (ChatGPT, Claude, Google Finance, Gmail, Perplexity, Notion, Eero),
  then content-tagged them with the local vision model.
- **Original ask:** Add batches of Android screenshots and have the foldable
  ones treated as a distinct form factor.
- **Why this approach:** Mirrors the existing `tablet_images` pattern — form
  factor lives in frontmatter, not the controlled-vocabulary `image_tags` — so
  it avoids taxonomy warnings and reuses the layout mechanism. Detection is
  resolution-derived rather than a manual list (per direction), and scoped to
  Android so it never overlaps the iOS `tablet_images` (iPad) bucket. Measured
  data confirmed a clean, wide gap: phone shots sit at r≈0.46, foldable
  captures at r≈0.97, with nothing between.
- **Rejected:** (a) a searchable `Foldable` content tag added to
  `screenshot_tags.csv` — form factor isn't screen content and it would need
  vocabulary upkeep; (b) a hand-maintained per-file list — unmaintainable
  versus dimension-based detection.
