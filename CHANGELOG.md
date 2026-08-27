# Change Log

Decisions behind AI-made changes to this repo — what changed, what prompted it,
why this approach, and what was considered and rejected.

## 2026-08-26 — Added Strawberry, Bubble, Google Opal, and Figma Weave to Web (Claude)

- **What:** Four new `Web/` galleries — Strawberry (37), Bubble (23), Figma
  Weave (14), Google Opal (9) — each with an `index.html` carrying
  product-level `tags` and per-screenshot `image_tags` drawn from
  `screenshot_tags.csv`, plus a `tags.json`. Also 18 new `Web/Airtable`
  screenshots covering the Omni app-builder flow, tagged the same way and
  merged into that product's existing `index.html` and `tags.json`.
  `npm run auto-tag:count` goes from `{"products":5,"images":101}` to
  `{"products":0,"images":0}`.
- **Original ask:** Four new app folders had been dropped into `Web/` and
  needed setup plus tagging.
- **Why this approach:** Tags were written by reading every screenshot rather
  than deferring to the scheduled CI tagger, which runs a 3B vision model and
  had a 101-image backlog it drains ~45 minutes at a time. That choice forces
  the `tags.json` half: `auto-tag.mjs` computes its backlog from `tags.json`,
  not the frontmatter, and `writeFrontmatter` replaces `image_tags` wholesale
  when it runs — so shipping the frontmatter alone would have left all 101
  images in the backlog and let the next scheduled run silently overwrite the
  hand tags with model output. Writing both files keeps the two sources
  agreeing and takes the products out of the backlog entirely.
- **Rejected:** (a) Frontmatter only, letting CI fill `image_tags` — slower,
  lower quality, and the clobber described above; (b) running the local tagger
  (`npm run tagger:start` + `auto-tag:local`) — a 3.3GB model download for
  output worse than reading the screenshots directly; (c) leaving the 18 new
  Airtable shots for CI — it would have split one batch of work across two
  tagging passes of differing quality.

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

## 2026-08-03 — Added a form-factor filter to galleries and the MCP server

- **What:** "Only Show Foldable" / "Only Show Tablet" chips in the gallery
  filter row (same line as the platform chips). Each is an exclusive toggle:
  default off, and when switched on the grid hides every image that isn't of
  that form factor (`toggleOnlyFormFactor` marks the grid; `.grid.only-*` CSS
  does the hiding). A chip is revealed only when the gallery actually holds
  those shots. Plus an optional `form_factor` param (`phone` | `tablet` |
  `foldable`) on the MCP `browse_by_platform` and `search_inspiration` tools.
  `_plugins/products_json.rb` now emits `tablet_images` / `foldable_images`
  into `products.json`; `form_factors` is defined in `_config.yml` as the
  single source for the chips.
- **Original ask:** Make form factor filterable, not just a column-width flag —
  refined to a single-row "Only Show X" toggle that isolates those captures.
- **Why this approach:** Reuses the `tablet_images` / `foldable_images` flags
  from the prior change — no new data model. The "Only Show X" toggle is a
  small grid class + CSS rule, so it reads clearly and composes with the
  existing platform chips. `form_factors` is centralized in `_config.yml` like
  `platforms`.
- **Rejected:** an additive per-class visibility toggle (the first cut, which
  started *on* and hid its own class) — replaced per direction with the
  exclusive "Only Show X" filter, which matches how people actually want to
  isolate a form factor. Also rejected: a new per-screenshot form-factor tag —
  duplicates the frontmatter flags.
