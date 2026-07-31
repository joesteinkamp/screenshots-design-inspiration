#!/usr/bin/env node

/**
 * validate-frontmatter.mjs
 *
 * Scans every `<Platform>/*\/index.html` for YAML frontmatter problems
 * (platforms come from `platforms:` in _config.yml), auto-fixing known-safe
 * ones. Used by:
 *   - CI (post auto-tag) to repair orphan list markers before Jekyll build
 *   - PR validation workflow (dry-run) to post suggestions to contributors
 *   - Contributors locally: `node scripts/validate-frontmatter.mjs --dry-run`
 *
 * Usage:
 *   node scripts/validate-frontmatter.mjs              # dry-run, human report
 *   node scripts/validate-frontmatter.mjs --fix        # apply fixes in place
 *   node scripts/validate-frontmatter.mjs --json       # machine report to stdout
 *   node scripts/validate-frontmatter.mjs --paths=Web/Superhuman/index.html
 *
 * Exit codes:
 *   0 — everything clean (or everything fixable; see below)
 *   1 — unfixable errors remain after all fixers (blocks CI)
 *   2 — fixes were applied (only meaningful with --fix; CI commits if 2)
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { loadPlatforms } from "./lib/platforms.mjs";

const TAXONOMY_CSV = "screenshot_tags.csv";

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { fix: false, dryRun: false, json: false, paths: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--fix") flags.fix = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--json") flags.json = true;
    else if (a === "--paths" && args[i + 1]) flags.paths = args[++i].split(",");
    else if (a.startsWith("--paths=")) flags.paths = a.slice("--paths=".length).split(",");
  }
  return flags;
}

function repoRoot() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}

function listIndexFiles(root, explicitPaths) {
  if (explicitPaths && explicitPaths.length) {
    return explicitPaths
      .map((p) => path.resolve(root, p))
      .filter((p) => fs.existsSync(p) && p.endsWith("index.html"));
  }
  const out = [];
  for (const platform of loadPlatforms(root)) {
    const platformDir = path.join(root, platform);
    if (!fs.existsSync(platformDir)) continue;
    for (const entry of fs.readdirSync(platformDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const indexPath = path.join(platformDir, entry.name, "index.html");
      if (fs.existsSync(indexPath)) out.push(indexPath);
    }
  }
  return out;
}

// Minimal RFC-4180 CSV parser (duplicated from auto-tag.mjs to avoid circular
// deps; keep in sync if taxonomy shape changes).
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
  if (!fs.existsSync(csvPath)) return null;
  const rows = parseCsv(fs.readFileSync(csvPath, "utf-8"));
  if (rows.length === 0) return null;
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const iTag = header.indexOf("tag");
  if (iTag < 0) return null;
  const allowed = new Set();
  for (const row of rows.slice(1)) {
    if (row[iTag]) allowed.add(row[iTag].trim());
  }
  return { allowed };
}

// Split a file into [frontmatterText, bodyText, frontmatterStartLine, frontmatterEndLine].
// Returns null if no frontmatter block is detectable.
function splitFrontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*(\r?\n|$)/);
  if (!m) return null;
  const fmText = m[1];
  const body = raw.slice(m[0].length);
  // Lines are 1-indexed. Opening --- is line 1; content starts at line 2.
  const fmStartLine = 2;
  const fmEndLine = fmStartLine + fmText.split("\n").length - 1;
  return { fmText, body, fmStartLine, fmEndLine };
}

// ---------------------------------------------------------------------------
// Fixers. Each takes the frontmatter *text* (lines between the --- markers)
// and returns { text, changes: [{ rule, line, before, after, message }] }.
// Line numbers are relative to the full file (1-indexed).
// ---------------------------------------------------------------------------

// Strip orphaned `    - Xxx` list markers sitting between mapping keys —
// the exact pattern the buggy auto-tagger used to leave behind.
function fixOrphanListMarkers(fmText, fmStartLine) {
  const lines = fmText.split("\n");
  const changes = [];
  const kept = [];
  // An orphan is a list item (`- X` with any leading indent) that appears
  // where the next non-blank line is a top-level mapping key (e.g. `image_tags:`)
  // or another non-list line at the same/outer indent level. We only flag
  // orphans whose preceding non-blank line is also a mapping scalar (e.g.
  // `tags: [...]` inline, or `gallery-directory: X`) — never a mapping key
  // waiting for its list.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isListItem = /^\s*-\s+\S/.test(line);
    if (!isListItem) { kept.push(line); continue; }

    // Find previous non-blank
    let prev = null;
    for (let j = kept.length - 1; j >= 0; j--) {
      if (kept[j].trim()) { prev = kept[j]; break; }
    }
    // Find next non-blank
    let next = null;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim()) { next = lines[j]; break; }
    }

    // If previous line is a mapping scalar (`key: value` or `key: [values]`)
    // AND this list item is at shallower or equal indent than a top-level
    // mapping key, it's an orphan. A real list follows a `key:` line with
    // no inline value.
    const prevIsScalarMapping = prev && /^\s*[^\s#-][^:]*:\s+\S/.test(prev);
    // OR previous line has no trailing value AND is not a key awaiting list:
    // then the list would be owned by prev — not orphan. So only flag when
    // prevIsScalarMapping.
    // Additionally: if next line is a top-level mapping key (`foo:`), the
    // list item is stranded.
    const nextIsMappingKey = next && /^\S+:\s*(\S.*)?$/.test(next);

    if (prevIsScalarMapping && (next === null || nextIsMappingKey)) {
      changes.push({
        rule: "orphan-list-marker",
        line: fmStartLine + i,
        before: line,
        after: "",
        message: `Removed orphan list marker. This line isn't under any mapping key.`,
      });
      // Drop the line entirely (orphan)
      continue;
    }
    kept.push(line);
  }
  return { text: kept.join("\n"), changes };
}

// Quote filename keys that start with a digit (or other YAML-ambiguous char)
// to prevent them from being parsed as integers/dates/floats.
function fixUnquotedDigitLeadingKeys(fmText, fmStartLine) {
  const lines = fmText.split("\n");
  const changes = [];
  let insideImageTags = false;
  const out = lines.map((line, i) => {
    // Detect entry/exit from the image_tags: block by indent.
    if (/^image_tags:\s*$/.test(line)) { insideImageTags = true; return line; }
    if (insideImageTags && line.length > 0 && !/^\s/.test(line)) {
      insideImageTags = false;
    }
    if (!insideImageTags) return line;

    // Indented mapping key, unquoted, starts with a digit.
    const m = line.match(/^(\s+)(\d[^"\n:]*?):\s*$/);
    if (!m) return line;
    const [, indent, key] = m;
    const newLine = `${indent}"${key}":`;
    changes.push({
      rule: "unquoted-digit-leading-key",
      line: fmStartLine + i,
      before: line,
      after: newLine,
      message: "Quoted a filename key that started with a digit so YAML doesn't parse it as a number.",
    });
    return newLine;
  });
  return { text: out.join("\n"), changes };
}

// Convert any tabs in the frontmatter to 2 spaces. YAML forbids tabs for
// indentation entirely.
function fixTabsToSpaces(fmText, fmStartLine) {
  const lines = fmText.split("\n");
  const changes = [];
  const out = lines.map((line, i) => {
    if (!line.includes("\t")) return line;
    const newLine = line.replace(/\t/g, "  ");
    changes.push({
      rule: "tab-in-frontmatter",
      line: fmStartLine + i,
      before: line,
      after: newLine,
      message: "Replaced tab(s) with 2 spaces. YAML forbids tabs in indentation.",
    });
    return newLine;
  });
  return { text: out.join("\n"), changes };
}

// Assemble fixers. Each returns { text, changes }.
// NOTE on narrow no-break spaces (U+202F): we deliberately do NOT auto-fix
// these in filename keys. macOS embeds U+202F in screenshot filenames like
// "Screenshot 2024-03-27 at 4.25.59 PM.png"; the file on disk contains
// U+202F, so the YAML key MUST also contain U+202F to match in Liquid
// lookups. Quoting the key (which js-yaml and our digit-leading fixer
// handle) is sufficient for YAML parsing.
const FIXERS = [
  { name: "tabs", fn: fixTabsToSpaces },
  { name: "digit-leading-keys", fn: fixUnquotedDigitLeadingKeys },
  { name: "orphan-list-markers", fn: fixOrphanListMarkers },
];

// Cross-check tags against taxonomy. Warn-only — never auto-remove.
function checkTaxonomy(parsed, taxonomy, file) {
  if (!taxonomy) return [];
  const warnings = [];
  const unknownFor = (label, list) => {
    if (!Array.isArray(list)) return;
    for (const t of list) {
      if (typeof t !== "string") continue;
      if (!taxonomy.allowed.has(t)) {
        warnings.push({
          rule: "tag-not-in-taxonomy",
          file,
          message: `Tag "${t}" (in ${label}) is not in screenshot_tags.csv. Either fix the spelling or add it to the taxonomy.`,
          tag: t,
          where: label,
        });
      }
    }
  };
  // Only the per-screenshot image_tags come from the controlled vocabulary.
  // Product-level `tags:` is a freeform descriptor (app name, vibe, flow).
  if (parsed?.image_tags && typeof parsed.image_tags === "object") {
    for (const [fn, tags] of Object.entries(parsed.image_tags)) {
      unknownFor(`image_tags["${fn}"]`, tags);
    }
  }
  return warnings;
}

function validateFile(filePath, taxonomy) {
  const result = {
    file: filePath,
    applied: [],   // fixes that were made
    warnings: [],  // non-fatal (taxonomy, duplicates, etc.)
    errors: [],    // unfixable — YAML invalid even after all fixers
    originalText: null,
    fixedText: null,
  };

  const raw = fs.readFileSync(filePath, "utf-8");
  result.originalText = raw;
  const split = splitFrontmatter(raw);
  if (!split) {
    result.errors.push({
      rule: "no-frontmatter",
      file: filePath,
      line: 1,
      message: "File has no YAML frontmatter block (expected `---` ... `---` at the top).",
    });
    result.fixedText = raw;
    return result;
  }

  let fmText = split.fmText;
  for (const { fn } of FIXERS) {
    const { text, changes } = fn(fmText, split.fmStartLine);
    fmText = text;
    for (const c of changes) result.applied.push({ ...c, file: filePath });
  }

  // Validate resulting YAML.
  let parsed = null;
  try {
    parsed = yaml.load(fmText);
  } catch (e) {
    // Try to extract a usable line number from js-yaml's error mark.
    const mark = e?.mark;
    const line = mark ? split.fmStartLine + (mark.line || 0) : split.fmStartLine;
    result.errors.push({
      rule: "yaml-parse-error",
      file: filePath,
      line,
      message: `YAML still invalid after auto-fixers: ${e?.reason || e?.message || "parse error"}. This one needs a human.`,
      detail: e?.message || String(e),
    });
  }

  if (parsed && typeof parsed === "object") {
    result.warnings.push(...checkTaxonomy(parsed, taxonomy, filePath));
  }

  // Reassemble the file text with fixed frontmatter.
  // Normalize trailing newline before closing ---.
  const fmTrimmed = fmText.replace(/\n+$/, "");
  result.fixedText = `---\n${fmTrimmed}\n---\n${split.body.replace(/^\r?\n/, "")}`;
  if (!result.fixedText.endsWith("\n")) result.fixedText += "\n";

  return result;
}

function humanReport(results) {
  let totalFixed = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  for (const r of results) {
    const hasAny = r.applied.length || r.errors.length || r.warnings.length;
    if (!hasAny) continue;
    console.log(`\n${path.relative(repoRoot(), r.file)}`);
    for (const a of r.applied) {
      console.log(`  [fix] line ${a.line}: ${a.rule} — ${a.message}`);
      totalFixed++;
    }
    for (const w of r.warnings) {
      console.log(`  [warn] ${w.rule}: ${w.message}`);
      totalWarnings++;
    }
    for (const e of r.errors) {
      console.log(`  [ERROR] line ${e.line}: ${e.rule} — ${e.message}`);
      totalErrors++;
    }
  }
  console.log(
    `\nSummary: ${results.length} file(s) scanned, ${totalFixed} auto-fix(es), ${totalWarnings} warning(s), ${totalErrors} error(s).`
  );
}

async function main() {
  const flags = parseArgs();
  const root = repoRoot();
  const taxonomy = loadTaxonomy(root);

  const files = listIndexFiles(root, flags.paths);
  const results = files.map((f) => validateFile(f, taxonomy));

  let anyFixed = false;
  if (flags.fix) {
    for (const r of results) {
      if (r.applied.length && r.fixedText && r.fixedText !== r.originalText) {
        fs.writeFileSync(r.file, r.fixedText, "utf-8");
        anyFixed = true;
      }
    }
  }

  if (flags.json) {
    const payload = {
      summary: {
        files: results.length,
        fixed: results.reduce((n, r) => n + r.applied.length, 0),
        warnings: results.reduce((n, r) => n + r.warnings.length, 0),
        errors: results.reduce((n, r) => n + r.errors.length, 0),
      },
      results: results.map((r) => ({
        file: path.relative(root, r.file),
        applied: r.applied.map((a) => ({ ...a, file: path.relative(root, a.file) })),
        warnings: r.warnings.map((w) => ({ ...w, file: path.relative(root, w.file) })),
        errors: r.errors.map((e) => ({ ...e, file: path.relative(root, e.file) })),
      })),
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else {
    humanReport(results);
  }

  const hasErrors = results.some((r) => r.errors.length > 0);
  if (hasErrors) process.exit(1);
  if (flags.fix && anyFixed) process.exit(2);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
