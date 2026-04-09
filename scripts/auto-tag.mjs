#!/usr/bin/env node

/**
 * auto-tag.mjs
 *
 * Scans product gallery folders for screenshots that are missing tags,
 * sends a sample of images to Claude's vision API, and writes the
 * generated tags back into each product's index.html frontmatter.
 *
 * Usage:
 *   node scripts/auto-tag.mjs                # tag only untagged products
 *   node scripts/auto-tag.mjs --all          # re-tag every product
 *   node scripts/auto-tag.mjs --dry-run      # preview without writing
 *   node scripts/auto-tag.mjs --product "Web/Airbnb"  # tag one product
 *
 * Requires ANTHROPIC_API_KEY environment variable.
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PLATFORMS = ["Web", "Mobile", "Email"];
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const MAX_IMAGES_PER_PRODUCT = 5; // keep API costs reasonable
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB per image (API limit)
const MODEL = "claude-sonnet-4-20250514";

// Top tags from the existing corpus — fed to Claude for consistency.
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
  const flags = {
    all: false,
    dryRun: false,
    product: null,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--all") flags.all = true;
    else if (args[i] === "--dry-run") flags.dryRun = true;
    else if (args[i] === "--product" && args[i + 1]) flags.product = args[++i];
  }
  return flags;
}

/** Return the root of the repo (parent of scripts/). */
function repoRoot() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}

/** List image files in a product directory, sorted by name. */
function listImages(productDir) {
  if (!fs.existsSync(productDir)) return [];
  return fs
    .readdirSync(productDir)
    .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort();
}

/** Read the tags array from index.html frontmatter. Returns null if no tags key. */
function readTags(indexPath) {
  if (!fs.existsSync(indexPath)) return null;
  const content = fs.readFileSync(indexPath, "utf-8");
  const match = content.match(/^tags:\s*\[([^\]]*)\]/m);
  if (!match) return null;
  const inner = match[1].trim();
  if (!inner) return [];
  return inner.split(",").map((t) => t.trim());
}

/** Read the full content of index.html. */
function readIndex(indexPath) {
  return fs.readFileSync(indexPath, "utf-8");
}

/** Write tags into the index.html frontmatter. Creates the file if missing. */
function writeTags(indexPath, tags, productName) {
  const tagsLine = `tags: [${tags.join(", ")}]`;

  if (!fs.existsSync(indexPath)) {
    // Create a new index.html with frontmatter
    const content = [
      "---",
      "layout: gallery",
      `gallery-directory: ${productName}`,
      tagsLine,
      "---",
      "",
    ].join("\n");
    fs.writeFileSync(indexPath, content, "utf-8");
    return;
  }

  let content = readIndex(indexPath);

  if (/^tags:\s*\[/m.test(content)) {
    // Replace existing tags line
    content = content.replace(/^tags:\s*\[[^\]]*\]/m, tagsLine);
  } else {
    // Insert tags before the closing ---
    content = content.replace(/^(---\s*)$/m, `${tagsLine}\n$1`);
  }

  fs.writeFileSync(indexPath, content, "utf-8");
}

/** Convert an image file to a base64 data source for the Anthropic API. */
function imageToBase64Source(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const mediaTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  const mediaType = mediaTypes[ext] || "image/png";

  const stats = fs.statSync(imagePath);
  if (stats.size > MAX_IMAGE_SIZE_BYTES) return null;

  const data = fs.readFileSync(imagePath).toString("base64");
  return { type: "image", source: { type: "base64", media_type: mediaType, data } };
}

/** Select a representative sample of images (first, middle, last, and a couple in between). */
function sampleImages(images) {
  if (images.length <= MAX_IMAGES_PER_PRODUCT) return images;
  const indices = new Set();
  indices.add(0);
  indices.add(images.length - 1);
  // Evenly space the remaining picks
  const step = (images.length - 1) / (MAX_IMAGES_PER_PRODUCT - 1);
  for (let i = 1; i < MAX_IMAGES_PER_PRODUCT - 1; i++) {
    indices.add(Math.round(step * i));
  }
  return [...indices].sort((a, b) => a - b).map((i) => images[i]);
}

// ---------------------------------------------------------------------------
// AI tagging
// ---------------------------------------------------------------------------

async function generateTags(client, productName, platform, imagePaths) {
  const imageBlocks = [];
  for (const imgPath of imagePaths) {
    const block = imageToBase64Source(imgPath);
    if (block) imageBlocks.push(block);
  }

  if (imageBlocks.length === 0) {
    console.warn(`  ⚠ No valid images for ${productName}, skipping.`);
    return null;
  }

  const prompt = `You are tagging screenshots for a design inspiration gallery. Analyze the provided screenshots from "${productName}" (${platform} platform) and generate 5-8 descriptive tags.

## Guidelines
- Tags should describe visual style, layout patterns, UI components, and purpose
- Prefer reusing existing tags from the gallery when they fit. Existing popular tags include:
  ${EXISTING_TAGS.join(", ")}
- You may create new tags when none of the existing ones fit, but keep them concise (1-3 words)
- Use Title Case for all tags
- Focus on what would help a designer find this as inspiration

## Output format
Return ONLY a JSON array of tag strings. No explanation, no markdown fences.
Example: ["Dark Mode", "Dashboard", "Data-heavy", "Sidebar Navigation", "Charts"]`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: [...imageBlocks, { type: "text", text: prompt }],
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    // Strip markdown fences if the model wraps them anyway
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const tags = JSON.parse(cleaned);
    if (Array.isArray(tags) && tags.every((t) => typeof t === "string")) {
      return tags;
    }
  } catch {
    console.error(`  ✗ Failed to parse tags for ${productName}: ${text}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();
  const root = repoRoot();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required.");
    process.exit(1);
  }

  const client = new Anthropic();

  // Discover products
  const products = [];

  if (flags.product) {
    // Single product mode
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

  console.log(`Found ${products.length} product(s) to check.\n`);

  let tagged = 0;
  let skipped = 0;

  for (const product of products) {
    const indexPath = path.join(product.dir, "index.html");
    const existingTags = readTags(indexPath);

    // Skip products that already have tags (unless --all)
    if (!flags.all && existingTags && existingTags.length > 0) {
      skipped++;
      continue;
    }

    const images = listImages(product.dir);
    if (images.length === 0) {
      console.log(`⏭ ${product.platform}/${product.name} — no images found`);
      skipped++;
      continue;
    }

    const sampled = sampleImages(images);
    const imagePaths = sampled.map((img) => path.join(product.dir, img));

    console.log(
      `🏷 ${product.platform}/${product.name} — analyzing ${sampled.length}/${images.length} images...`
    );

    const tags = await generateTags(client, product.name, product.platform, imagePaths);

    if (!tags) {
      skipped++;
      continue;
    }

    console.log(`  → ${tags.join(", ")}`);

    if (!flags.dryRun) {
      writeTags(indexPath, tags, product.name);
      console.log(`  ✓ Written to ${path.relative(root, indexPath)}`);
    } else {
      console.log(`  (dry run — not written)`);
    }

    tagged++;
  }

  console.log(
    `\nDone. Tagged: ${tagged}, Skipped: ${skipped}, Total: ${products.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
