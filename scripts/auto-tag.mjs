#!/usr/bin/env node

/**
 * auto-tag.mjs
 *
 * Tags individual screenshots using a vision model. Each image is analysed
 * on its own and gets its own set of tags, stored in a `tags.json` file
 * alongside the product's index.html. The union of all per-screenshot tags
 * is also written into the index.html frontmatter so the existing gallery,
 * search, and MCP server keep working.
 *
 * Two backends are supported:
 *   - `gemini`  Google Gemini Vision API (needs GEMINI_API_KEY)
 *   - `local`   Local Qwen2.5-VL via llama.cpp's llama-server (no API key,
 *               talks to an OpenAI-compatible /v1/chat/completions endpoint)
 *
 * If --backend is not supplied, `local` is used when LOCAL_TAGGER_URL is set
 * (or http://127.0.0.1:8080 is reachable), otherwise `gemini`.
 *
 * Usage:
 *   node scripts/auto-tag.mjs                     # tag only untagged screenshots
 *   node scripts/auto-tag.mjs --all               # re-tag every screenshot
 *   node scripts/auto-tag.mjs --dry-run           # preview without writing
 *   node scripts/auto-tag.mjs --product "Web/Airbnb"
 *   node scripts/auto-tag.mjs --backend local     # force local backend
 *   node scripts/auto-tag.mjs --backend gemini    # force Gemini backend
 *   node scripts/auto-tag.mjs --local-url http://127.0.0.1:8080
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PLATFORMS = ["Web", "Mobile", "Email"];
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB per image
const GEMINI_MODEL = "gemini-2.5-flash";
const LOCAL_DEFAULT_URL = process.env.LOCAL_TAGGER_URL || "http://127.0.0.1:8080";
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 2000; // exponential backoff: 2s, 4s, 8s, 16s

// Top tags from the existing corpus — fed to the model for consistency.
const EXISTING_TAGS = [
  "Minimalist", "Dashboard", "Dark Mode", "Data-heavy", "Card Layout",
  "Clean", "Onboarding", "Light Mode", "Grid Layout", "Sidebar Navigation",
  "Modern", "List View", "Analytics", "Onboarding Flow", "SaaS",
  "Professional", "High Contrast", "Bright Colors", "Clean Typography",
  "Productivity", "Data Visualization", "Blue Accents", "Collaboration",
  "Typography-focused", "Illustrations", "Financial", "Enterprise",
  "Card-based", "Bottom Navigation", "Search-centric", "Form-heavy",
  "Bold Typography", "Tables", "Social Login", "Masonry Layout",
  "Map Integration", "Clean UI", "Charts", "Sticky Header", "Sidebar",
  "Project Management", "Modern SaaS", "Material Design", "Iconography",
  "E-commerce", "Developer-centric", "AI-Focused", "Chat-centric",
  "Image-heavy", "Consumer-focused", "Modal-driven",
];

const MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    all: false,
    dryRun: false,
    product: null,
    limit: 20,
    backend: null,
    localUrl: LOCAL_DEFAULT_URL,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--all") flags.all = true;
    else if (args[i] === "--dry-run") flags.dryRun = true;
    else if (args[i] === "--product" && args[i + 1]) flags.product = args[++i];
    else if (args[i] === "--limit" && args[i + 1]) flags.limit = parseInt(args[++i], 10);
    else if (args[i] === "--no-limit") flags.limit = Infinity;
    else if (args[i] === "--backend" && args[i + 1]) flags.backend = args[++i];
    else if (args[i] === "--local-url" && args[i + 1]) flags.localUrl = args[++i];
  }
  return flags;
}

function repoRoot() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}

function listImages(productDir) {
  if (!fs.existsSync(productDir)) return [];
  return fs
    .readdirSync(productDir)
    .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort();
}

function readTagsJson(productDir) {
  const p = path.join(productDir, "tags.json");
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function writeTagsJson(productDir, tagsMap) {
  const sorted = Object.keys(tagsMap).sort().reduce((acc, key) => {
    acc[key] = tagsMap[key];
    return acc;
  }, {});
  fs.writeFileSync(
    path.join(productDir, "tags.json"),
    JSON.stringify(sorted, null, 2) + "\n",
    "utf-8"
  );
}

function aggregateTags(tagsMap) {
  const all = new Set();
  for (const tags of Object.values(tagsMap)) {
    for (const t of tags) all.add(t);
  }
  return [...all].sort();
}

function writeFrontmatterImageTags(indexPath, tagsMap, productName) {
  const imageTagsLines = ["image_tags:"];
  for (const filename of Object.keys(tagsMap).sort()) {
    const tags = tagsMap[filename];
    if (!tags || tags.length === 0) continue;
    imageTagsLines.push(`  "${filename}":`);
    for (const tag of tags) {
      imageTagsLines.push(`    - ${tag}`);
    }
  }
  const imageTagsBlock = imageTagsLines.join("\n");

  if (!fs.existsSync(indexPath)) {
    const content = [
      "---",
      "layout: gallery",
      `gallery-directory: ${productName}`,
      "tags: []",
      imageTagsBlock,
      "---",
      "",
    ].join("\n");
    fs.writeFileSync(indexPath, content, "utf-8");
    return;
  }

  let content = fs.readFileSync(indexPath, "utf-8");
  content = content.replace(
    /^image_tags:\n(?:  .*\n(?:    - .*\n)*)*/m,
    ""
  );
  content = content.replace(
    /^(---\s*)$/m,
    `${imageTagsBlock}\n$1`
  );

  fs.writeFileSync(indexPath, content, "utf-8");
}

function readImageBase64(imagePath) {
  const stats = fs.statSync(imagePath);
  if (stats.size > MAX_IMAGE_SIZE_BYTES) return null;
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || "image/png";
  const data = fs.readFileSync(imagePath).toString("base64");
  return { mimeType, data };
}

async function asyncPool(limit, items, fn) {
  const results = [];
  const executing = new Set();
  for (const [i, item] of items.entries()) {
    const p = fn(item, i).then((r) => { executing.delete(p); return r; });
    executing.add(p);
    results.push(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.all(results);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransientError(err) {
  const status = err?.status ?? err?.response?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable") ||
    msg.includes("rate limit") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("fetch failed")
  );
}

function buildPrompt(productName, platform) {
  return `You are tagging a single screenshot for a design inspiration gallery.
This screenshot is from "${productName}" (${platform} platform).

Generate 3-6 descriptive tags for THIS specific screenshot.

## Guidelines
- Tags should describe visual style, layout patterns, UI components, and purpose visible in this screenshot
- Prefer reusing existing tags when they fit. Existing popular tags include:
  ${EXISTING_TAGS.join(", ")}
- You may create new tags when none of the existing ones fit, but keep them concise (1-3 words)
- Use Title Case for all tags
- Focus on what would help a designer find this screenshot as inspiration

## Output format
Return ONLY a JSON array of tag strings. No explanation, no markdown fences.
Example: ["Dark Mode", "Dashboard", "Sidebar Navigation"]`;
}

function parseTagsFromText(text, imageName) {
  try {
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const arrayMatch = cleaned.match(/\[[\s\S]*?\]/);
    const jsonText = arrayMatch ? arrayMatch[0] : cleaned;
    const tags = JSON.parse(jsonText);
    if (Array.isArray(tags) && tags.every((t) => typeof t === "string")) {
      return tags;
    }
  } catch {
    console.error(`    ✗ Failed to parse tags for ${imageName}: ${text}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------

async function createGeminiBackend() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required for gemini backend.");
  }
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  return {
    name: "gemini",
    concurrency: 5,
    async tag(productName, platform, imagePath) {
      const img = readImageBase64(imagePath);
      if (!img) return null;
      const part = { inlineData: { mimeType: img.mimeType, data: img.data } };
      const prompt = buildPrompt(productName, platform);

      let text;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await model.generateContent([part, { text: prompt }]);
          text = result.response.text();
          break;
        } catch (err) {
          const transient = isTransientError(err);
          if (!transient || attempt === MAX_RETRIES) {
            const label = transient ? "API unavailable" : "API error";
            console.error(
              `    ✗ ${label} for ${path.basename(imagePath)} after ${attempt + 1} attempt(s): ${err?.message || err}`
            );
            return null;
          }
          const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
          console.error(
            `    ⟲ Transient error for ${path.basename(imagePath)} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: ${err?.message || err}`
          );
          await sleep(delay);
        }
      }
      return parseTagsFromText(text, path.basename(imagePath));
    },
  };
}

async function createLocalBackend(serverUrl) {
  // Ping /health to make sure llama-server is up before we start tagging.
  try {
    const res = await fetch(`${serverUrl}/health`, { method: "GET" });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    throw new Error(
      `Local tagger not reachable at ${serverUrl} (${err?.message || err}). ` +
      `Start it with: scripts/start-local-tagger.sh`
    );
  }

  return {
    name: "local",
    // Single in-flight request — local server is the bottleneck and parallelism
    // on CPU just thrashes. Override with --concurrency if you have a GPU.
    concurrency: 1,
    async tag(productName, platform, imagePath) {
      const img = readImageBase64(imagePath);
      if (!img) return null;
      const dataUrl = `data:${img.mimeType};base64,${img.data}`;
      const prompt = buildPrompt(productName, platform);

      const body = {
        // model field is ignored by llama-server but required by some clients
        model: "qwen2.5-vl",
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: prompt },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 256,
      };

      let text;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await fetch(`${serverUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            const err = new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
            err.status = res.status;
            throw err;
          }
          const json = await res.json();
          text = json.choices?.[0]?.message?.content || "";
          break;
        } catch (err) {
          const transient = isTransientError(err);
          if (!transient || attempt === MAX_RETRIES) {
            const label = transient ? "server unavailable" : "server error";
            console.error(
              `    ✗ Local ${label} for ${path.basename(imagePath)} after ${attempt + 1} attempt(s): ${err?.message || err}`
            );
            return null;
          }
          const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
          console.error(
            `    ⟲ Transient error for ${path.basename(imagePath)} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: ${err?.message || err}`
          );
          await sleep(delay);
        }
      }
      return parseTagsFromText(text, path.basename(imagePath));
    },
  };
}

async function selectBackend(flags) {
  let choice = flags.backend;
  if (!choice) {
    // Auto-detect: prefer local if reachable, fall back to gemini.
    try {
      const res = await fetch(`${flags.localUrl}/health`, { method: "GET" });
      if (res.ok) choice = "local";
    } catch {
      // ignore
    }
    if (!choice) choice = process.env.GEMINI_API_KEY ? "gemini" : "local";
  }
  if (choice === "gemini") return createGeminiBackend();
  if (choice === "local") return createLocalBackend(flags.localUrl);
  throw new Error(`Unknown backend "${choice}". Use "gemini" or "local".`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();
  const root = repoRoot();

  const backend = await selectBackend(flags);
  console.log(`Using backend: ${backend.name}`);

  const products = [];
  if (flags.product) {
    const fullPath = path.join(root, flags.product);
    const parts = flags.product.split("/");
    products.push({
      platform: parts[0],
      name: parts.slice(1).join("/"),
      dir: fullPath,
    });
  } else {
    for (const platform of PLATFORMS) {
      const platformDir = path.join(root, platform);
      if (!fs.existsSync(platformDir)) continue;
      const entries = fs.readdirSync(platformDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        products.push({
          platform,
          name: entry.name,
          dir: path.join(platformDir, entry.name),
        });
      }
    }
  }

  console.log(`Found ${products.length} product(s) to check.`);
  if (flags.limit !== Infinity) {
    console.log(`Limit: ${flags.limit} products per run (use --no-limit to process all)`);
  }
  console.log();

  let productsTagged = 0;
  let screenshotsTagged = 0;
  let productsSkipped = 0;

  for (const product of products) {
    if (productsTagged >= flags.limit) {
      console.log(`\nReached limit of ${flags.limit} products. Run again to continue.`);
      break;
    }
    const indexPath = path.join(product.dir, "index.html");
    const images = listImages(product.dir);

    if (images.length === 0) {
      console.log(`⏭ ${product.platform}/${product.name} — no images found`);
      productsSkipped++;
      continue;
    }

    const existingTagsMap = readTagsJson(product.dir);
    const toTag = flags.all
      ? images
      : images.filter((img) => !existingTagsMap[img] || existingTagsMap[img].length === 0);

    if (toTag.length === 0) {
      productsSkipped++;
      continue;
    }

    console.log(
      `🏷 ${product.platform}/${product.name} — tagging ${toTag.length}/${images.length} screenshots...`
    );

    const results = await asyncPool(backend.concurrency, toTag, async (imgName) => {
      const imgPath = path.join(product.dir, imgName);
      const tags = await backend.tag(product.name, product.platform, imgPath);
      if (tags) {
        console.log(`    ✓ ${imgName} → ${tags.join(", ")}`);
      }
      return { imgName, tags };
    });

    const updatedTagsMap = { ...existingTagsMap };
    for (const { imgName, tags } of results) {
      if (tags) {
        updatedTagsMap[imgName] = tags;
        screenshotsTagged++;
      }
    }

    const aggregated = aggregateTags(updatedTagsMap);
    console.log(`  → ${Object.keys(updatedTagsMap).length} screenshots, ${aggregated.length} unique tags`);

    if (!flags.dryRun) {
      writeTagsJson(product.dir, updatedTagsMap);
      writeFrontmatterImageTags(indexPath, updatedTagsMap, product.name);
      console.log(`  ✓ Written tags.json + image_tags in ${path.relative(root, indexPath)}`);
    } else {
      console.log(`  (dry run — not written)`);
    }

    productsTagged++;
  }

  console.log(
    `\nDone. Products tagged: ${productsTagged}, Screenshots tagged: ${screenshotsTagged}, Products skipped: ${productsSkipped}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
