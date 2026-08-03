#!/usr/bin/env node

/**
 * mark-tablet-screenshots.mjs
 *
 * Writes a `tablet_images:` list into gallery frontmatter listing the
 * screenshots that are tablet-shaped rather than phone-shaped.
 *
 * Why this exists: platform (the directory) tells us iOS vs Android, but not
 * phone vs tablet, and iPad captures live inside iOS galleries alongside iPhone
 * ones. The gallery layout gives phone screenshots a narrow grid column sized
 * for a 9:19.5 frame; an iPad screenshot squeezed into that column renders
 * uselessly small. Jekyll can't measure image dimensions without an extra gem,
 * so record the classification in frontmatter at authoring time instead.
 *
 * Classification is by aspect ratio, not by device resolution, so it keeps
 * working for devices we haven't seen. Phone portrait screenshots cluster at
 * 0.46-0.56 (w/h) and tablet portrait at 0.75 (3:4), a wide and stable gap.
 * Landscape captures are deliberately left alone — they have their own
 * pre-existing layout behavior and aren't what this flag is for.
 *
 * Usage:
 *   node scripts/mark-tablet-screenshots.mjs             # report only
 *   node scripts/mark-tablet-screenshots.mjs --write      # update frontmatter
 *
 * Run `node scripts/validate-frontmatter.mjs --fix` afterwards to restore the
 * quoting convention on filename keys.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import sharp from "sharp";
import { loadPhonePlatforms, repoRoot } from "./lib/platforms.mjs";

// Portrait, but meaningfully wider than any phone. Upper bound keeps squares
// and landscape out.
const TABLET_MIN_RATIO = 0.62;
const TABLET_MAX_RATIO = 1.05;

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif"]);
const KEY_ORDER = ["layout", "gallery-directory", "redirect_from", "tags", "tablet_images", "foldable_images", "image_tags"];

function orderKeys(obj) {
  const out = {};
  for (const k of KEY_ORDER) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
  return out;
}

async function classify(dir, files) {
  const tablets = [];
  for (const f of files) {
    try {
      const { width, height } = await sharp(path.join(dir, f)).metadata();
      if (!width || !height) continue;
      const ratio = width / height;
      if (ratio >= TABLET_MIN_RATIO && ratio <= TABLET_MAX_RATIO) tablets.push(f);
    } catch {
      // Unreadable image — leave it unclassified rather than guessing.
    }
  }
  return tablets.sort();
}

async function main() {
  const write = process.argv.includes("--write");
  const root = repoRoot();
  let changed = 0;
  let totalTablets = 0;

  // Only phone platforms give screenshots a narrow column, so the flag is
  // meaningless anywhere else.
  for (const platform of loadPhonePlatforms(root)) {
    const platformDir = path.join(root, platform);
    if (!fs.existsSync(platformDir)) continue;

    for (const entry of fs.readdirSync(platformDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(platformDir, entry.name);
      const indexPath = path.join(dir, "index.html");
      if (!fs.existsSync(indexPath)) continue;

      const files = fs
        .readdirSync(dir)
        .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()));
      const tablets = await classify(dir, files);

      const raw = fs.readFileSync(indexPath, "utf-8");
      const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
      if (!m) continue;
      let fm;
      try {
        fm = yaml.load(m[1]) || {};
      } catch {
        console.log(`  skip (unparseable frontmatter): ${platform}/${entry.name}`);
        continue;
      }

      const existing = Array.isArray(fm.tablet_images) ? fm.tablet_images : [];
      if (JSON.stringify(existing) === JSON.stringify(tablets)) continue;

      if (tablets.length) {
        fm.tablet_images = tablets;
        totalTablets += tablets.length;
      } else {
        delete fm.tablet_images;
      }
      changed++;
      console.log(
        `  ${platform}/${entry.name}: ${tablets.length} tablet / ${files.length} images`
      );

      if (write) {
        const out =
          "---\n" +
          yaml.dump(orderKeys(fm), {
            lineWidth: -1,
            quotingType: '"',
            forceQuotes: false,
            noRefs: true,
            sortKeys: false,
          }) +
          "---\n" +
          m[2];
        fs.writeFileSync(indexPath, out, "utf-8");
      }
    }
  }

  console.log(
    `\n${changed} gallery(ies) ${write ? "updated" : "would change"}, ` +
      `${totalTablets} tablet screenshot(s) marked.`
  );
  if (!write && changed) console.log("Re-run with --write to apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
