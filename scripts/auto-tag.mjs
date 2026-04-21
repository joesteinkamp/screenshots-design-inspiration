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
const TAXONOMY_CSV = "screenshot_tags.csv";
// Downscale images before sending to the local model so the vision encoder
// produces fewer tokens per image. 1024px max on the long edge is plenty for
// identifying UI elements and screen types, and roughly halves embedding
// time versus 1440–1920px native screenshots. Original files are never modified.
const LOCAL_IMAGE_MAX_DIM = parseInt(process.env.LOCAL_IMAGE_MAX_DIM || "1024", 10);

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
    else if (args[i] === "--skip-valid-vocab") flags.skipValidVocab = true;
    else if (args[i] === "--repair-frontmatter") flags.repairFrontmatter = true;
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

  const raw = fs.readFileSync(indexPath, "utf-8");
  // Match proper Jekyll frontmatter: --- ... --- at the top of the file.
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\r?\n|$)/);
  let yaml;
  let body;
  if (fmMatch) {
    yaml = fmMatch[1];
    body = raw.slice(fmMatch[0].length);
  } else {
    // No valid frontmatter — synthesize one. This also repairs files where
    // a previous buggy write prepended `image_tags:` BEFORE the opening ---.
    // Strip any stray leading image_tags block and any wrongly-placed
    // frontmatter that follows.
    const stripped = raw
      .replace(/^image_tags:\n(?:  .*\n(?:    - .*\n)*)*/m, "")
      .replace(/^---\s*\n([\s\S]*?)\n---\s*(?:\r?\n|$)/, (_, y) => {
        yaml = y;
        return "";
      });
    if (!yaml) {
      yaml = [
        "layout: gallery",
        `gallery-directory: ${productName}`,
        "tags: []",
      ].join("\n");
    }
    body = stripped.replace(/^\s+/, "");
  }

  // Remove any pre-existing image_tags block from yaml so we can re-write it.
  // The frontmatter capture group strips the trailing newline, so the last
  // dash line in the block has no `\n` and the line-oriented regex below
  // leaves it orphaned. Append a sentinel newline so every line is matchable.
  yaml = (yaml + "\n").replace(/^image_tags:\n(?:  .*\n(?:    - .*\n)*)*/m, "").trimEnd();
  const newFrontmatter = `---\n${yaml}\n${imageTagsBlock}\n---\n`;
  fs.writeFileSync(indexPath, newFrontmatter + body, "utf-8");
}

function readImageBase64(imagePath) {
  const stats = fs.statSync(imagePath);
  if (stats.size > MAX_IMAGE_SIZE_BYTES) return null;
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || "image/png";
  const data = fs.readFileSync(imagePath).toString("base64");
  return { mimeType, data };
}

// In-memory downscale for the local backend. Returns a JPEG buffer base64'd;
// the source file on disk is never modified. Returns null if the image is
// unreadable, too large on disk, or too small (llama.cpp's mtmd requires
// both dimensions >= 2, and we drop anything under 32px as junk).
async function readImageResizedBase64(imagePath, maxDim) {
  const stats = fs.statSync(imagePath);
  if (stats.size > MAX_IMAGE_SIZE_BYTES) return null;
  const sharp = (await import("sharp")).default;
  const meta = await sharp(imagePath).metadata();
  if (!meta.width || !meta.height || meta.width < 32 || meta.height < 32) {
    return { tooSmall: true };
  }
  const buf = await sharp(imagePath)
    .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { mimeType: "image/jpeg", data: buf.toString("base64") };
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

// Minimal RFC-4180 CSV parser: handles `"..."` quoting, embedded commas, and
// doubled quotes `""`. Assumes newlines never appear inside a quoted field.
function parseCsv(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  for (const line of lines) {
    const fields = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let val = "";
        i++;
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else { val += line[i++]; }
        }
        fields.push(val);
        if (line[i] === ",") i++;
      } else {
        let end = line.indexOf(",", i);
        if (end === -1) end = line.length;
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
    rows.push(fields);
  }
  return rows;
}

function loadTaxonomy(root) {
  const csvPath = path.join(root, TAXONOMY_CSV);
  if (!fs.existsSync(csvPath)) {
    throw new Error(
      `Taxonomy file not found at ${csvPath}. ` +
      `The tagger needs ${TAXONOMY_CSV} at the repo root.`
    );
  }
  const rows = parseCsv(fs.readFileSync(csvPath, "utf-8"));
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const iType = header.indexOf("type");
  const iGroup = header.indexOf("group");
  const iTag = header.indexOf("tag");
  const iDesc = header.indexOf("description");
  if (iType < 0 || iGroup < 0 || iTag < 0 || iDesc < 0) {
    throw new Error(`Unexpected CSV header in ${TAXONOMY_CSV}: ${rows[0].join(",")}`);
  }
  // Group by Type → Group → [{tag, desc}]
  const byType = new Map();
  const allowed = new Set();
  const allowedByType = new Map(); // Type → Set<tag>
  for (const row of rows.slice(1)) {
    if (row.length < 4) continue;
    const type = row[iType].trim();
    const group = row[iGroup].trim();
    const tag = row[iTag].trim();
    const desc = row[iDesc].trim();
    if (!type || !tag) continue;
    if (!byType.has(type)) byType.set(type, new Map());
    const byGroup = byType.get(type);
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push({ tag, desc });
    allowed.add(tag);
    if (!allowedByType.has(type)) allowedByType.set(type, new Set());
    allowedByType.get(type).add(tag);
  }
  return { byType, allowed, allowedByType };
}

function formatTaxonomyForPrompt(byType) {
  const lines = [];
  for (const [type, byGroup] of byType) {
    lines.push(`### ${type.toUpperCase()}`);
    for (const [group, items] of byGroup) {
      lines.push(`\n# ${group}`);
      for (const { tag, desc } of items) {
        lines.push(`- ${tag}: ${desc}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function buildPrompt(productName, platform, taxonomy) {
  const vocab = formatTaxonomyForPrompt(taxonomy.byType);
  return `You are tagging a single screenshot for a design-inspiration gallery.
The screenshot is from "${productName}" (${platform} platform).

You MUST pick tags from the controlled vocabulary below. DO NOT invent new tags. DO NOT paraphrase. Copy each tag string EXACTLY as written (same spelling, casing, punctuation).

Tags go into two buckets:

1. "screens" — the type of screen. Pick 1 to 3:
   - exactly one primary screen type that best describes what this screenshot shows;
   - optionally add "Dark Mode" if the screen is clearly in dark mode;
   - optionally add a Layouts tag if one clearly dominates.
   All picks MUST come from the SCREENS vocabulary below.

2. "ui_elements" — the interface components visible on screen. Pick 3 to 6 of the most salient ones, each DIFFERENT. Skip trivial or barely-visible ones, and DO NOT repeat a tag.
   All picks MUST come from the UI ELEMENTS vocabulary below.

## Vocabulary

${vocab}

## Output

Return ONLY a JSON object with exactly the shape:
{"screens": [...], "ui_elements": [...]}

No explanation, no markdown fences. Base every tag on what is actually in the screenshot — do not invent tags and do not add a tag just because it would commonly fit this kind of app.`;
}

function parseTagsFromText(text, imageName, taxonomy) {
  try {
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    // The prompt asks for an object, but older callers (or Gemini off-format)
    // may still return a flat array. Accept either.
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrMatch = cleaned.match(/\[[\s\S]*?\]/);
    const jsonText = objMatch ? objMatch[0] : (arrMatch ? arrMatch[0] : cleaned);
    const raw = JSON.parse(jsonText);

    let candidates;
    if (Array.isArray(raw)) {
      candidates = raw;
    } else if (raw && typeof raw === "object") {
      const screens = Array.isArray(raw.screens) ? raw.screens : [];
      const ui = Array.isArray(raw.ui_elements) ? raw.ui_elements : [];
      candidates = [...screens, ...ui];
    } else {
      return null;
    }
    if (!candidates.every((t) => typeof t === "string")) return null;

    const seen = new Set();
    const kept = [];
    const dropped = [];
    for (const t of candidates) {
      const trimmed = t.trim();
      if (taxonomy.allowed.has(trimmed)) {
        if (!seen.has(trimmed)) { seen.add(trimmed); kept.push(trimmed); }
      } else {
        dropped.push(trimmed);
      }
    }
    if (dropped.length > 0) {
      console.error(`    ⚠ ${imageName}: dropped ${dropped.length} out-of-vocab tag(s): ${dropped.join(", ")}`);
    }
    return kept.length > 0 ? kept : null;
  } catch {
    console.error(`    ✗ Failed to parse tags for ${imageName}: ${text}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------

async function createGeminiBackend(taxonomy) {
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
      const prompt = buildPrompt(productName, platform, taxonomy);

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
      return parseTagsFromText(text, path.basename(imagePath), taxonomy);
    },
  };
}

function buildTagJsonSchema(taxonomy) {
  // Grammar-constrain the local model's output: a structured object with two
  // typed arrays, each drawing from a different enum. Without this, small VL
  // models emit free-text preambles, hit max_tokens in a loop, or pick only
  // from one type. llama.cpp converts this to a GBNF grammar that the sampler
  // enforces token-by-token. (`uniqueItems` isn't enforced by the grammar —
  // we de-dupe in post-processing instead.)
  const screensEnum = [...(taxonomy.allowedByType.get("Screens") || [])].sort();
  const uiEnum = [...(taxonomy.allowedByType.get("UI Elements") || [])].sort();
  return {
    type: "object",
    properties: {
      screens: {
        type: "array",
        items: { type: "string", enum: screensEnum },
        minItems: 1,
        maxItems: 3,
      },
      ui_elements: {
        type: "array",
        items: { type: "string", enum: uiEnum },
        minItems: 3,
        maxItems: 6,
      },
    },
    required: ["screens", "ui_elements"],
    additionalProperties: false,
  };
}

async function createLocalBackend(serverUrl, taxonomy) {
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

  const schema = buildTagJsonSchema(taxonomy);

  return {
    name: "local",
    // Single in-flight request — local server is the bottleneck and parallelism
    // on CPU just thrashes. Override with --concurrency if you have a GPU.
    concurrency: 1,
    async tag(productName, platform, imagePath) {
      const img = await readImageResizedBase64(imagePath, LOCAL_IMAGE_MAX_DIM);
      if (!img) return null;
      if (img.tooSmall) {
        console.log(`    ⏭ ${path.basename(imagePath)} — skipped (image too small)`);
        return null;
      }
      const dataUrl = `data:${img.mimeType};base64,${img.data}`;
      const prompt = buildPrompt(productName, platform, taxonomy);

      const body = {
        // model field is ignored by llama-server but required by some clients
        model: "qwen2.5-vl",
        messages: [
          {
            role: "user",
            // Text BEFORE image: the ~8k-token taxonomy prefix is identical
            // across every call, so llama.cpp's prompt cache can reuse it.
            // Only the image (~1.5k tokens) needs re-embedding per request.
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 512,
        cache_prompt: true,
        // llama.cpp server converts this to a GBNF grammar, forcing the model
        // to emit `{"screens": [...], "ui_elements": [...]}` with picks drawn
        // from the controlled vocabulary.
        response_format: {
          type: "json_schema",
          json_schema: { name: "tags", strict: true, schema },
        },
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
      return parseTagsFromText(text, path.basename(imagePath), taxonomy);
    },
  };
}

async function selectBackend(flags, taxonomy) {
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
  if (choice === "gemini") return createGeminiBackend(taxonomy);
  if (choice === "local") return createLocalBackend(flags.localUrl, taxonomy);
  throw new Error(`Unknown backend "${choice}". Use "gemini" or "local".`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();
  const root = repoRoot();

  const taxonomy = loadTaxonomy(root);
  console.log(
    `Loaded taxonomy: ${taxonomy.allowed.size} tags across ${taxonomy.byType.size} type(s).`
  );

  if (flags.repairFrontmatter) {
    let repaired = 0;
    for (const platform of PLATFORMS) {
      const platformDir = path.join(root, platform);
      if (!fs.existsSync(platformDir)) continue;
      for (const entry of fs.readdirSync(platformDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const productDir = path.join(platformDir, entry.name);
        const indexPath = path.join(productDir, "index.html");
        if (!fs.existsSync(indexPath)) continue;
        const tagsMap = readTagsJson(productDir);
        if (Object.keys(tagsMap).length === 0) continue;
        writeFrontmatterImageTags(indexPath, tagsMap, entry.name);
        repaired++;
      }
    }
    console.log(`Repaired frontmatter in ${repaired} index.html files.`);
    return;
  }

  const backend = await selectBackend(flags, taxonomy);
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
    const hasValidVocabTags = (img) => {
      const tags = existingTagsMap[img];
      return Array.isArray(tags) && tags.length > 0 && tags.every((t) => taxonomy.allowed.has(t));
    };
    const toTag = flags.all
      ? images
      : flags.skipValidVocab
      ? images.filter((img) => !hasValidVocabTags(img))
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
