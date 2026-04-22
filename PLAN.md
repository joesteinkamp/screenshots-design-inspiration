# Plan

Notes on outstanding work for this repo.

## Improve screenshot tag quality

The current per-screenshot `image_tags` are noisy and shallow — they tend to
list generic UI primitives (`Button`, `Text Field`, `Icon`, `Divider`) over and
over instead of describing what the screen actually is or does. That makes
search results dominated by ubiquitous components and dilutes the value of the
gallery as design inspiration.

What "better" tags should capture:

- **Screen purpose / pattern** — `Onboarding Step`, `Empty State`, `Pricing
  Table`, `Settings`, `Filter Drawer`, etc.
- **Visual style** — `Glassmorphism`, `Neumorphism`, `Brutalist`, `Editorial`,
  `Hand-drawn`, etc.
- **Interaction or state** — `Loading`, `Error`, `Selected`, `Disabled`,
  `Hover`, etc.
- **Content type** — `Map`, `Chart`, `Photo Grid`, `Video Player`, `Code
  Block`, etc.

What to avoid:

- Re-tagging every component in the screenshot (that's design-system
  documentation, not inspiration metadata).
- Tags that only restate the platform (already in the `platform` field).
- Free-text tags — keep a controlled vocabulary so search and filtering stay
  predictable.

Likely path forward: revise the auto-tagger prompt in `scripts/auto-tag.mjs`
and re-run it across the gallery, then commit the updates via the existing
bot workflow.
