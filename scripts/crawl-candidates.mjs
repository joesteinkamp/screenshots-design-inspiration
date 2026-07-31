#!/usr/bin/env node

/**
 * crawl-candidates.mjs
 *
 * Discovery-only product crawler. Pulls freshly-launched products from a set
 * of ToS-clean sources (YC, Hacker News "Show HN", GitHub, Product Hunt RSS),
 * dedupes them against the ~410 products already in the gallery and against a
 * persisted `crawler/seen.json`, then writes a human-reviewable candidate
 * manifest under `crawler/candidates/<date>.md`.
 *
 * It never fetches or commits third-party images and never touches the gallery
 * folders — a human reviews the manifest and adds real, self-captured
 * screenshots through the normal contribution flow. See crawler/README.md.
 *
 * Usage:
 *   node scripts/crawl-candidates.mjs                                  # all sources, default cap
 *   node scripts/crawl-candidates.mjs --sources hn,yc                  # subset
 *   node scripts/crawl-candidates.mjs --limit 15
 *   node scripts/crawl-candidates.mjs --dry-run                        # print, write nothing
 */

import fs from "node:fs";
import path from "node:path";

import { fetchCandidates as yc } from "./sources/yc.mjs";
import { fetchCandidates as hn } from "./sources/hn.mjs";
import { fetchCandidates as github } from "./sources/github.mjs";
import { fetchCandidates as producthunt } from "./sources/producthunt.mjs";
import { loadPlatforms } from "./lib/platforms.mjs";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SOURCES = { yc, hn, github, producthunt };
const DEFAULT_LIMIT = 15;
const SEEN_PATH = "crawler/seen.json";
const CANDIDATES_DIR = "crawler/candidates";

// Company/legal suffixes and TLD-ish fragments stripped when normalizing a
// name for dedupe. Keeps "Foo, Inc." and "Foo.io" from looking distinct.
const NAME_NOISE = /\b(inc|llc|ltd|co|corp|the)\b|\.(io|com|app|ai|dev|co|xyz|so|sh)\b/gi;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { sources: Object.keys(SOURCES), limit: DEFAULT_LIMIT, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") flags.dryRun = true;
    else if (args[i] === "--limit" && args[i + 1]) flags.limit = parseInt(args[++i], 10);
    else if (args[i] === "--sources" && args[i + 1]) {
      flags.sources = args[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return flags;
}

function repoRoot() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}

// Normalize a product name to a dedupe key: lowercase, drop diacritics, strip
// legal/TLD noise and punctuation, collapse whitespace.
function normalizeName(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop decomposed combining accents
    .toLowerCase()
    .replace(NAME_NOISE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Registrable-ish domain from a URL: hostname minus leading www., last two
// labels. Good enough to catch "app.foo.com" vs "foo.com" as the same product.
function domainOf(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const parts = host.split(".");
    return parts.length > 2 ? parts.slice(-2).join(".") : host;
  } catch {
    return "";
  }
}

// The set of names already represented as gallery folders (folder name equals
// the `gallery-directory` frontmatter value, so folder names are the catalog).
function existingProductNames(root) {
  const names = new Set();
  for (const platform of loadPlatforms(root)) {
    const dir = path.join(root, platform);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) names.add(normalizeName(entry.name));
    }
  }
  return names;
}

function loadSeen(root) {
  const p = path.join(root, SEEN_PATH);
  if (!fs.existsSync(p)) return { names: [], domains: [] };
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    return { names: data.names || [], domains: data.domains || [] };
  } catch {
    return { names: [], domains: [] };
  }
}

function writeSeen(root, seen) {
  const p = path.join(root, SEEN_PATH);
  const sorted = {
    names: [...new Set(seen.names)].sort(),
    domains: [...new Set(seen.domains)].sort(),
  };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
}

// Suggested gallery bucket. We have little platform signal from these sources,
// so default to Web and only bump to Mobile on an obvious app-store URL. The
// human reviewer confirms/edits in the PR.
function suggestPlatform(candidate) {
  const u = (candidate.url || "").toLowerCase();
  if (/apps\.apple\.com|play\.google\.com|itunes\.apple\.com/.test(u)) return "Mobile";
  return "Web";
}

function escapePipes(s) {
  return String(s || "").replace(/\|/g, "\\|");
}

function buildManifest(dateStr, candidates, stats) {
  const lines = [];
  lines.push(`# Product candidates — ${dateStr}`);
  lines.push("");
  lines.push(
    `Auto-generated by \`scripts/crawl-candidates.mjs\`. Each row is a *candidate* — a ` +
      `product discovered from a launch source, not yet in the gallery. Review, then ` +
      `add the good ones with real self-captured screenshots via the normal ` +
      `[contribution flow](../../CONTRIBUTING.md). **Do not reuse the sources' images.**`
  );
  lines.push("");
  lines.push(
    `Scanned ${stats.fetched} candidates from ${stats.sources.join(", ")}; ` +
      `${stats.afterDedupe} new after dedupe; showing ${candidates.length} ` +
      `(cap ${stats.limit}).`
  );
  lines.push("");
  lines.push("| ✓ | Product | URL | Source | Suggested | Tagline |");
  lines.push("|---|---------|-----|--------|-----------|---------|");
  for (const c of candidates) {
    lines.push(
      `| [ ] | ${escapePipes(c.name)} | ${escapePipes(c.url)} | ${escapePipes(c.source)} | ` +
        `${c.platform} | ${escapePipes(c.tagline)} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();
  const root = repoRoot();
  const dateStr = new Date().toISOString().slice(0, 10);

  const selected = flags.sources.filter((s) => {
    if (SOURCES[s]) return true;
    console.error(`⚠ Unknown source "${s}" — skipping. Known: ${Object.keys(SOURCES).join(", ")}`);
    return false;
  });
  if (selected.length === 0) {
    console.error("No valid sources selected. Nothing to do.");
    process.exit(1);
  }

  console.log(`Sources: ${selected.join(", ")} | limit: ${flags.limit}${flags.dryRun ? " | dry-run" : ""}`);

  // Fetch every source concurrently; a source that throws is logged and
  // skipped so the run still produces a manifest.
  const settled = await Promise.allSettled(
    selected.map(async (s) => ({ source: s, items: await SOURCES[s]() }))
  );

  const raw = [];
  const okSources = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      const { source, items } = r.value;
      console.log(`  ✓ ${source}: ${items.length} candidates`);
      okSources.push(source);
      raw.push(...items);
    } else {
      console.error(`  ✗ source failed: ${r.reason?.message || r.reason}`);
    }
  }

  // Dedupe: against existing gallery folders, against seen.json, and within
  // this batch (first occurrence wins).
  const existing = existingProductNames(root);
  const seen = loadSeen(root);
  const seenNames = new Set(seen.names);
  const seenDomains = new Set(seen.domains.filter(Boolean));
  const batchNames = new Set();
  const batchDomains = new Set();

  const fresh = [];
  for (const c of raw) {
    if (!c.name || !c.url) continue;
    const key = normalizeName(c.name);
    const dom = domainOf(c.url);
    if (!key) continue;
    if (existing.has(key)) continue;
    if (seenNames.has(key) || (dom && seenDomains.has(dom))) continue;
    if (batchNames.has(key) || (dom && batchDomains.has(dom))) continue;
    batchNames.add(key);
    if (dom) batchDomains.add(dom);
    fresh.push({ ...c, platform: suggestPlatform(c) });
  }

  const capped = fresh.slice(0, flags.limit);

  console.log(
    `\nFetched ${raw.length} raw · ${fresh.length} new after dedupe · ${capped.length} in manifest`
  );

  const manifest = buildManifest(dateStr, capped, {
    fetched: raw.length,
    afterDedupe: fresh.length,
    limit: flags.limit,
    sources: okSources,
  });

  if (flags.dryRun) {
    console.log("\n----- manifest (dry-run, not written) -----\n");
    console.log(manifest);
    return;
  }

  if (capped.length === 0) {
    console.log("No new candidates — nothing written.");
    return;
  }

  // Persist: manifest file + updated seen.json (record everything we surfaced
  // so it doesn't reappear next run, accepted or not).
  const outPath = path.join(root, CANDIDATES_DIR, `${dateStr}.md`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, manifest, "utf-8");
  console.log(`Wrote ${path.relative(root, outPath)}`);

  for (const c of capped) {
    seen.names.push(normalizeName(c.name));
    const dom = domainOf(c.url);
    if (dom) seen.domains.push(dom);
  }
  writeSeen(root, seen);
  console.log(`Updated ${SEEN_PATH} (${new Set(seen.names).size} names, ${new Set(seen.domains).size} domains)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
