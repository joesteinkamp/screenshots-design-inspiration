# Change Log

Decisions behind AI-made changes to this repo — what changed, what prompted it,
why this approach, and what was considered and rejected.

## 2026-10-12 — Prepared the Manus gallery (Claude)

- **What:** Added `Web/Manus/index.html` and `tags.json`, a web MP4 of the
  Manus recording, and three tagged stills (task plan and todo, dashboard
  analytics preview, task completed). The sidebar user name and the
  restricted-site page's SITE/USER box (work email) are pixelated in the MP4
  and stills. Removed the original Manus `.mov` added in #110, since the MP4
  now duplicates it.
- **Original ask:** Make the Manus recording committed in #110 appear in the
  gallery, as #108 did for Gemini.
- **Why this approach:** Follows the Gemini pattern — the gallery renders MP4
  and ignores MOV, and search and MCP index images, so stills accompany the
  video. Re-encoded (H.264, CRF 26, faststart) rather than remuxed because a
  lossless copy would be another ~95 MB in the repo and on every gallery load.
  Redaction matches the repo's existing `_anon` handling of personal details.
- **Rejected:** A lossless remux, for size; trimming the video before the
  restricted page, because that would cut the task-completed result.

## 2026-10-12 — Added original Gemini and Manus screen recordings (Claude)

- **What:** Committed the source `.mov` behind #108's remuxed
  `gemini-chat-2026-09-15.mp4`, and the original Manus screen recording
  (`Web/Manus/`, ~95 MB) as-is.
- **Original ask:** Commit outstanding local work, including the Manus
  recording, and open a PR.
- **Why this approach:** Keeps the lossless source recordings in the repo
  alongside any derived media. The Manus file is under GitHub's 100 MiB
  per-file limit, so it was committed without Git LFS.
- **Rejected:** Holding the Manus recording until it was compressed to MP4 with
  gallery metadata — the user chose to commit the original now. Committing the
  `.DS_Store` changes, because they are Finder metadata.

## 2026-10-10 — Prepared Gemini, Claude Design, and Claude captures (Codex)

- **What:** Tagged 54 new Claude and Claude Design screenshots, corrected five
  stale Claude Design tag lists, and added Gemini gallery metadata with two
  tagged stills and a losslessly remuxed MP4.
- **Original ask:** Prepare the Gemini, Claude Design, and Claude folders for
  upload, including new folders and images that need tags.
- **Why this approach:** Kept the existing JSON/frontmatter schema so the
  gallery, search, and MCP receive consistent per-image tags. Stills accompany
  the Gemini recording because search and MCP index images. Preserved source
  filenames and media, packaged Unicode filenames with explicit UTF-8 support,
  and excluded temporary ImageOptim artifacts from the prepared upload.
- **Rejected:** A MOV-only upload, because the gallery renders MP4; a
  video-only gallery, because it would lack searchable screenshots. Remuxing
  the existing H.264 recording preserves its quality without re-encoding.

## 2026-10-10 — Updated MCP installation guidance

- **What:** Updated MCP installation examples to use npm's moving `latest` tag
  with noninteractive `npx --yes`, and documented the release command sequence.
- **Original ask:** Prevent users from having to edit the MCP version number for
  every release and avoid interactive installation failures.
- **Why this approach:** npm advances the `latest` dist-tag when a new release
  is published, so clients can receive updates after restarting or reloading
  their MCP host without configuration changes.
- **Rejected:** Pinning a specific package version in client configuration,
  because it creates recurring manual maintenance for every user.

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
