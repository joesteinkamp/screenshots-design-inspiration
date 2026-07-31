# Screenshots - Design Inspiration
The goal of this project is to create a simple site for finding design inspiration that can be updated by anyone. There's been plenty of great app screenshot galleries that have come and gone or stopped being maintained. Hopefully, with it being open-source and maintainable by many, it will stay as useful as possible.

## MCP Server

This repo includes a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets AI tools query the screenshot library directly. AI models often lack access to curated, real product screenshots — this MCP bridges that gap by giving AI tools access to 410+ products across Web, iOS, Android, and Email with tagged metadata and actual images.

### Use Cases

- **UI design research** — Ask your AI tool "show me how products handle dark mode dashboards" and get real screenshots from Stripe, Linear, Notion, etc.
- **Design pattern exploration** — Search by tags like "Onboarding", "SaaS Dashboard", "Card-based", "Minimalist" to see how real products solve specific UI problems
- **Creative inspiration** — Get random product screenshots to spark ideas when starting a new design
- **Competitive analysis** — Browse all Web, iOS, or Android products in a specific category to see common patterns
- **Reference for implementation** — When building a new feature, pull up real-world examples to guide your design decisions

### Setup

**Claude Code:**

```bash
claude mcp add design-screenshots --scope user npx screenshots-design-inspiration-mcp
```

**Claude Desktop, Cursor, or any MCP client:**

Add to your MCP config file:

```json
{
  "mcpServers": {
    "design-screenshots": {
      "command": "npx",
      "args": ["screenshots-design-inspiration-mcp"]
    }
  }
}
```

No repo clone, no install, no build required. `npx` handles everything.

### Available Tools

| Tool | Description |
|------|-------------|
| `list_tags` | List all available design tags with product counts. Start here to see what's searchable. |
| `search_by_tags` | Find products matching design tags (e.g. "Dark Mode", "SaaS Dashboard"). Supports AND/OR matching. |
| `search_inspiration` | Search by free-text query, product tags, screenshot tags, or any combination — e.g. `product_tags=["AI-first"], screenshot_tags=["Dashboard"]`. |
| `search_screenshots_by_tags` | Find individual screenshots by their per-image tags (e.g. "onboarding", "empty state") across all products. |
| `get_product_screenshots` | Get screenshots for a specific product. Returns base64 images for in-chat viewing by default. Pass `include_images=false` to get metadata + download URLs only (no base64) — useful when saving to disk or avoiding context bloat. |
| `browse_by_platform` | List all products for Web, iOS, Android, or Email with pagination. |
| `get_random_inspiration` | Get random products for creative exploration, with optional tag/platform filters. |

### Download URLs

Every product response includes pre-encoded `download_urls` (on the product) and
`download_url` (on each screenshot). Prefer these over building URLs yourself —
filenames may contain non-ASCII whitespace (e.g. `U+202F`) that needs specific
percent-encoding. To save screenshots to disk, call `get_product_screenshots`
with `include_images=false` and fetch each `download_url` with your client's
own file-writing tools.

---

## Contributing

### For Git Novices
1. Download & Install [GitHub Desktop](https://desktop.github.com/)
2. Use GitHub Desktop to pull down the repo. Add Repository from "Clone A Repository"
3. Clone from "URL" using `https://github.com/joesteinkamp/screenshots-design-inspiration.git`
4. Begin making changes in the Local Path on your computer
5. Push changes


### How to Add to an Existing App
Pretty straight forward, just add the new screenshots to the correct folder.


### How to Add a New App
To add a new app, create a folder for it named after the App then create an `index.html` file that has `gallery-directory: {App Name}` with {App Name} replaced.

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full frontmatter schema, common gotchas (YAML is picky!), and the local validation command.

### Build-time safety

The Jekyll build is resilient to frontmatter typos:

- **Before build**, `scripts/validate-frontmatter.mjs --fix` auto-repairs known-safe YAML errors (orphan list markers, unquoted digit-leading filename keys, tabs in indentation). Fixes are committed back to `main` by the CI bot.
- **During build**, the `_plugins/safe_frontmatter.rb` safety net catches any remaining YAML errors and renders the affected product with minimal fallback metadata — one bad file no longer kills the whole site.
- **On every PR**, the validator runs in dry-run mode and leaves inline `suggestion` comments so contributors can one-click apply fixes.

If you see a bot commit titled `chore(bot): auto-tag + auto-fix frontmatter` on `main` after your PR is merged, that's the validator cleaning up.

---

## Auto-tagging screenshots

`scripts/auto-tag.mjs` walks the gallery folders, finds untagged screenshots, runs them through a vision model, and writes tags into `tags.json` + the product's `index.html` frontmatter.

Two backends are supported:

| Backend | When to use | Requires |
|---|---|---|
| `local` (default in CI) | No API key, fully reproducible builds | Docker + ~6GB disk for model weights |
| `gemini` | Faster on a laptop without local model setup | `GEMINI_API_KEY` env var |

### Running locally (local backend, Qwen2.5-VL-7B via llama.cpp)

```bash
npm run tagger:download    # one-time, ~6GB into scripts/.models/ (gitignored)
npm run tagger:start       # starts llama-server in Docker on :8080
npm run auto-tag:local
npm run tagger:stop
```

Tags come from a controlled vocabulary in `screenshot_tags.csv` (173 tags: Screens + UI Elements). The script drops any tag the model invents that isn't in the CSV.

### Running locally (Gemini backend)

```bash
export GEMINI_API_KEY=...
npm run auto-tag
```

### In CI

`.github/workflows/deploy.yml` caches the model weights, runs `llama-server` in Docker, tags any new screenshots with the local backend, and commits the results before the Jekyll build. No API key required.
