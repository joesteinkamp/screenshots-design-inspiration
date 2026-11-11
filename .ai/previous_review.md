# Daily Repo Opportunity Scan: 2026-11-11

*No commits to `master` since 2026-10-12 (#111). New activity since the last scan (2026-11-04, branch `claude/sweet-maxwell-mty2bg`, never merged): one crawler run (`crawler/candidates`, 2026-11-09) and 14 open Dependabot branches.*

## 1. Net-New Opportunities (High Priority)
- **The crawler starves its best design sources.** In `scripts/crawl-candidates.mjs:197-233`, the sources are concatenated in a fixed order (yc, hn, github, producthunt). Then `fresh.slice(0, flags.limit)` keeps the first 15. The 2026-11-09 manifest found 88 new candidates and kept 10 from YC and 5 from Show HN. Product Hunt and GitHub got zero rows. The kept rows include drone networks, snake robots and a "detect someone staring" toy, none of which has a UI to capture. Fix: pick from the sources round-robin (or cap each source at `limit / n`), and score UI-heavy signals higher (taglines with "app", "workspace", "editor" or "design"; Product Hunt). Benefit: the weekly review PR produces candidates worth adding to the gallery instead of noise.
- **Dependabot backlog has no policy.** There is no `.github/dependabot.yml`, so only ungrouped security updates arrive. That is 14 branches so far, 10 of them for `mcp-server/`. One of them, `zod` 3→4 (`origin/dependabot/.../zod-4.6.7`), is a major version bump. Check it against `@modelcontextprotocol/sdk`'s zod peer before merging, because `mcp-server/src/tools.ts:1` builds every tool schema with `z`. Fix: add a `dependabot.yml` that groups minor and patch updates for each directory (`/`, `/mcp-server`, `/functions`) and leaves majors as separate PRs.

## 2. Design System & UI Consistency
No significant new deviations today. No UI files changed since the last scan.

## 3. Status of Previous Flags
- MCP version hardcoded at `mcp-server/src/index.ts:9` (`"1.1.1"`): **Open.**
- Extract `_includes/filter-chips.html` from `_layouts/gallery.html`: **Open.**
- Inline `var(--token, #hex)` fallbacks in `_includes/search-lunr.html`: **Open.**
- Raw `#ef5350` / `#fff` (need `--danger-color` / `--on-primary` tokens): **Open.**
- `grid-gallery.css` has its own palette: **Open.**
- Unminified vendored `lunr.js` / `material-photo-gallery.js`: **Open.**
- Process note: the past scan reports were pushed to separate `claude/sweet-maxwell-*` branches and never merged. Each run therefore starts with no baseline on `master`. Merge one scan PR, or point the routine at a fixed branch.

## 4. Suggested Action/Execution Plan
`claude -p "In scripts/crawl-candidates.mjs, replace fresh.slice(0, limit) with a round-robin pick across sources (fair share per source, leftovers filled from any source), then run it with --dry-run and confirm every source that returned results appears"`
