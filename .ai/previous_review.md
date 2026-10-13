# Daily Repo Opportunity Scan: 2026-08-12

*First run — no `.ai/previous_review.md` existed yet, so this is a baseline scan rather than a diff.*

## 1. Net-New Opportunities (High Priority)

- **`mcp-server` package.json/package-lock.json version drift.** The last commit (`a8a69d8`, "mcp version increase") bumped `mcp-server/package.json` from `1.0.3` → `1.1.1`, but `mcp-server/package-lock.json` was only updated to `1.0.4` (`mcp-server/package.json:3` vs `mcp-server/package-lock.json:3,9`). `npm ci` inside `mcp-server/` will now fail on the version mismatch. Cheap to fix, worth doing before the next publish.
- **Frontmatter key-ordering logic duplicated three ways.** `scripts/mark-foldable-screenshots.mjs` and `scripts/mark-tablet-screenshots.mjs` contain a byte-for-byte identical `KEY_ORDER` array, `orderKeys()` function, frontmatter regex, and yaml dump/write-back flow. `scripts/auto-tag.mjs` independently reimplements the same concept under different names (`FRONTMATTER_KEY_ORDER`, `orderFrontmatterKeys()`, `dumpFrontmatter()`, its own regex — lines 196–231, 260). The scripts' own comments admit these three copies must be kept in sync by hand. This is exactly the kind of drift `scripts/lib/` exists to prevent (it already holds `platforms.mjs`, reused correctly by all three scripts) — pulling key-ordering into `scripts/lib/frontmatter.mjs` removes a real correctness risk (a new frontmatter key added to one copy and not the other two).
- **Image-extension allowlist drift between Jekyll plugins risks silently dropping content.** `_plugins/gallery_images.rb:5` includes `.mp4` in its recognized image extensions; `_plugins/product_list.rb:11` and `_plugins/products_json.rb:20` declare their own separate lists that omit `.mp4`. A product whose only/newest capture is a video will show up in its gallery page but silently vanish from the homepage product list and from `products.json` (which feeds the MCP server and search). Worth centralizing into one constant.

## 2. Design System & UI Consistency

- **`assets/css/style.scss` already defines a token system at `:root` (lines 10–46: colors, `--spacing-*`, `--radius-*`, `--shadow-*`) but new rules keep bypassing it.** The primary color is hand-typed as `#6366f1` / `rgba(99, 102, 241, …)` at 9+ call sites (e.g. lines 224–225, 400, 606, 731, 752, 941) instead of `var(--primary-color)`, and `box-shadow` is hardcoded at 7 sites (225, 706, 752, 789, 866, 941, 977) instead of `var(--shadow-sm/md/lg)`. Refactor: sweep these to the existing custom properties — no new abstraction needed, the tokens already exist.
- **Form-factor filter CSS doesn't scale the way the platform-chip mechanism does.** `assets/css/style.scss:371–377` hardcodes `.grid.only-foldable` / `.grid.only-tablet` selectors literally per form factor, even though `form_factors` is already a config-driven list in `_config.yml` (the same way `platforms` drives the platform chips generically). The code comment at that spot already flags this ("written out literally per factor… add a rule when adding a form factor"). Low urgency today (only 2 factors), but the next form factor added will require a manual CSS addition instead of falling out of config — worth a Sass `@each` loop over `form_factors` while there are still only two cases to convert.

## 3. Status of Previous Flags

No prior report exists — nothing to carry forward. `PLAN.md`'s one open item (improving `image_tags` quality in `scripts/auto-tag.mjs`) and `CHANGELOG.md`'s two entries (foldable form-factor flag, form-factor gallery filter) are both pre-existing/acknowledged and intentionally out of scope here, not re-flagged.

## 4. Suggested Action/Execution Plan

```
npm --prefix mcp-server install
```
Regenerates `mcp-server/package-lock.json` to match `package.json`'s `1.1.1`, then commit the lockfile — fixes the highest-priority, build-breaking drift introduced in the most recent commit.
