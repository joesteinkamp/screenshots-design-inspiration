#!/usr/bin/env node

/**
 * auto-tag.mjs
 *
 * Tags individual screenshots using Gemini's vision API. Each image is
 * analysed on its own and gets its own set of tags, stored in a
 * `tags.json` file alongside the product's index.html. The union of all
 * per-screenshot tags is also written into the index.html frontmatter
 * so the existing gallery, search, and MCP server keep working.
 *
 * Usage:
 *   node scripts/auto-tag.mjs                # tag only untagged screenshots
 *   node scripts/auto-tag.mjs --all          # re-tag every screenshot
 *   node scripts/auto-tag.mjs --dry-run      # preview without writing
 *   node scripts/auto-tag.mjs --product "Web/Airbnb"  # tag one product
 *
 * Requires GEMINI_API_KEY environment variable.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PLATFORMS = ["Web", "Mobile", "Email"];
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB per image
const MODEL = "gemini-2.5-flash";
const CONCURRENCY = 5; // parallel API calls per product

// Top tags from the existing corpus — fed to Gemini for consistency.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { all: false, dryRun: false, product: null, limit: 20 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--all") flags.all = true;
    else if (args[i] === "--dry-run") flags.dryRun = true;
    else if (args[i] === "--product" && args[i + 1]) flags.product = args[++i];
    else if (args[i] === "--limit" && args[i + 1]) flags.limit = parseInt(args[++i], 10);
    else if (args[i] === "--no-limit") flags.limit = Infinity;
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

/** Read existing tags.json for a product. Returns {} if missing. */
function readTagsJson(productDir) {
  const p = path.join(productDir, "tags.json");
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

/** Write per-screenshot tags to tags.json. */
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

/** Aggregate per-screenshot tags into a deduplicated, sorted array. */
function aggregateTags(tagsMap) {
  const all = new Set();
  for (const tags of Object.values(tagsMap)) {
    for (const t of tags) all.add(t);
  }
  return [...all].sort();
}

/**
 * Write per-screenshot tags as `image_tags` into index.html frontmatter.
 * Preserves the existing product-level `tags` array untouched.
 */
function writeFrontmatterImageTags(indexPath, tagsMap, productName) {
  // Build the image_tags YAML block
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

  // Remove any existing image_tags block (everything from `image_tags:` to the
  // next top-level key or closing `---`)
  content = content.replace(
    /^image_tags:\n(?:  .*\n(?:    - .*\n)*)*/m,
    ""
  );

  // Insert image_tags block before the closing ---
  content = content.replace(
    /^(---\s*)$/m,
    `${imageTagsBlock}\n$1`
  );

  fs.writeFileSync(indexPath, content, "utf-8");
}

function imageToGeminiPart(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  const mimeType = mimeTypes[ext] || "image/png";

  const stats = fs.statSync(imagePath);
  if (stats.size > MAX_IMAGE_SIZE_BYTES) return null;

  const data = fs.readFileSync(imagePath).toString("base64");
  return { inlineData: { mimeType, data } };
}

/** Run async tasks with a concurrency limit. */
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

// ---------------------------------------------------------------------------
// AI tagging — one screenshot at a time
// ---------------------------------------------------------------------------

async function tagScreenshot(model, productName, platform, imagePath) {
  const part = imageToGeminiPart(imagePath);
  if (!part) return null;

  const prompt = `You are tagging a single screenshot for a design inspiration gallery.
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

  const result = await model.generateContent([part, { text: prompt }]);
  const text = result.response.text();

  try {
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const tags = JSON.parse(cleaned);
    if (Array.isArray(tags) && tags.every((t) => typeof t === "string")) {
      return tags;
    }
  } catch {
    console.error(`    ✗ Failed to parse tags for ${path.basename(imagePath)}: ${text}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();
  const root = repoRoot();

  if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable is required.");
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL });

  // Discover products
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

    // Load existing per-screenshot tags
    const existingTagsMap = readTagsJson(product.dir);

    // Determine which screenshots need tagging
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

    // Tag each screenshot individually, with concurrency limit
    const results = await asyncPool(CONCURRENCY, toTag, async (imgName) => {
      const imgPath = path.join(product.dir, imgName);
      const tags = await tagScreenshot(model, product.name, product.platform, imgPath);
      if (tags) {
        console.log(`    ✓ ${imgName} → ${tags.join(", ")}`);
      }
      return { imgName, tags };
    });

    // Merge new tags into the existing map
    const updatedTagsMap = { ...existingTagsMap };
    for (const { imgName, tags } of results) {
      if (tags) {
        updatedTagsMap[imgName] = tags;
        screenshotsTagged++;
      }
    }

    // Summary
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
