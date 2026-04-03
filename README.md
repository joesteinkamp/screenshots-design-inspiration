# Screenshots - Design Inspiration
The goal of this project is to create a simple site for finding design inspiration that can be updated by anyone. There's been plenty of great app screenshot galleries that have come and gone or stopped being maintained. Hopefully, with it being open-source and maintainable by many, it will stay as useful as possible.

## MCP Server

This repo includes a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets AI tools query the screenshot library directly. AI models often lack access to curated, real product screenshots — this MCP bridges that gap by giving AI tools access to 410+ products across Web, Mobile, and Email with tagged metadata and actual images.

### Use Cases

- **UI design research** — Ask your AI tool "show me how products handle dark mode dashboards" and get real screenshots from Stripe, Linear, Notion, etc.
- **Design pattern exploration** — Search by tags like "Onboarding", "SaaS Dashboard", "Card-based", "Minimalist" to see how real products solve specific UI problems
- **Creative inspiration** — Get random product screenshots to spark ideas when starting a new design
- **Competitive analysis** — Browse all Web or Mobile products in a specific category to see common patterns
- **Reference for implementation** — When building a new feature, pull up real-world examples to guide your design decisions

### Setup

**Claude Code:**

```bash
claude mcp add design-screenshots -- npx screenshots-design-inspiration-mcp
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
| `search_inspiration` | Free-text search across product names and tags (e.g. "onboarding flow", "messaging chat"). |
| `get_product_screenshots` | Get actual screenshot images for a specific product. Returns base64-encoded images. |
| `browse_by_platform` | List all products for Web, Mobile, or Email with pagination. |
| `get_random_inspiration` | Get random products for creative exploration, with optional tag/platform filters. |

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
