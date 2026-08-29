# Daily Repo Opportunity Scan: 2026-08-19

_No `.ai/previous_review.md` existed before this run — this is the baseline scan. Future runs should diff against this file rather than re-flagging what's noted here as still open._

## 1. Net-New Opportunities (High Priority)

- **Form-factor taxonomy now has two sources of truth.** The recent form-factor filter work (`5f7251a`, `f1d2152`, `1a13848`) added `form_factors:` to `_config.yml` (`Foldable`, `Tablet` — read by `_layouts/gallery.html` to build the filter chips) and separately hardcoded `const FORM_FACTORS = ["phone", "tablet", "foldable"] as const` in `mcp-server/src/tools.ts:21`. Unlike `PLATFORMS` in `mcp-server/src/types.ts:5`, which carries an explicit comment ("must be kept in step by hand") documenting the manual-sync tradeoff, `FORM_FACTORS` has no such note, and it includes `"phone"` as an implicit default that never appears in `_config.yml` at all. Next time someone adds a form factor (e.g. a `desktop` or `watch` shape), it's easy to update the Jekyll config and gallery chips but forget the MCP server's enum, silently breaking the `form_factor` filter for AI callers. Value unlock: either derive `FORM_FACTORS` from the fetched `products.json` index at runtime (the index already carries `tablet_images`/`foldable_images` per product, so the set of *possible* factors is knowable from data, not a separate constant), or at minimum add the same "kept in sync by hand" comment `PLATFORMS` has so the next change doesn't drift silently.

## 2. Design System & UI Consistency

- **`upload.html:7-14`** ships a scoped `<style>` block hardcoding `max-width: 800px`, `margin: 40px auto`, `padding: 20px`, and `font-family: 'Outfit', sans-serif` — all values that already exist as tokens in `assets/css/style.scss`'s `:root` (`--spacing-lg: 24px`, `--spacing-xl: 32px`, `--font-family: 'Outfit', sans-serif`). The comment justifies it as a hedge against the main CSS lagging on this page, but it means this page's spacing will silently diverge if the token values ever change. Suggested refactor: pull the container rule into `style.scss` proper (or reference the CSS custom properties inside the scoped block) so `upload.html` inherits the same spacing scale as the rest of the site.
- **Second UI stack, contained but worth flagging once:** `upload.html` loads Preact + htm from `esm.sh` via CDN `<script type="module">`, independent of the vanilla JS (`toggle-visibility.js`) used by every gallery page. This isn't new (last touched in `8874576`) and isn't causing active problems, so it's not an action item today — just noting it here as the one place a component-style framework exists in an otherwise template-driven site, in case future upload-page work is tempted to extend it rather than centralize on one approach.

## 3. Status of Previous Flags

No prior review exists — nothing to carry forward. `PLAN.md`'s open item ("Improve screenshot tag quality" for `scripts/auto-tag.mjs`) is already tracked there by the maintainer, so it's not repeated here.

## 4. Suggested Action/Execution Plan

`claude "In mcp-server/src/tools.ts, derive FORM_FACTORS from the product index's tablet_images/foldable_images keys instead of hardcoding it, or add a PLATFORMS-style sync comment; verify it still matches _config.yml's form_factors list"`
