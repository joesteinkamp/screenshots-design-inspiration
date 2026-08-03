#!/usr/bin/env node

/**
 * mark-foldable-screenshots.mjs
 *
 * Writes a `foldable_images:` list into gallery frontmatter listing the
 * screenshots captured on an unfolded foldable's inner display, so the gallery
 * can give them a wider column than a phone-shaped shot.
 *
 * Why this exists: the directory tells us the platform (Android) but not the
 * form factor, and an unfolded foldable capture is nearly square — squeezed
 * into the narrow phone column it renders tiny, the same problem `tablet_images`
 * solves for iPad captures inside iOS galleries. Jekyll can't measure image
 * dimensions without an extra gem, so record the classification in frontmatter
 * at authoring time instead. This is the foldable sibling of
 * scripts/mark-tablet-screenshots.mjs.
 *
 * Classification is by resolution, not by a hand-maintained file list, so it
 * keeps working for screenshots we haven't seen. Two facts make it robust:
 *   1. Foldables are an Android form factor, so we only look inside Android
 *      galleries — that keeps iPad (iOS) captures out of the foldable bucket
 *      and vice-versa, the two lists stay naturally disjoint.
 *   2. An unfolded inner display is nearly square. Measured short/long edge
 *      ratios cluster high and tight:
 *        Galaxy Z Fold 3/4/5   2176x1812  -> 0.833
 *        Galaxy Z Fold 6       2160x1856  -> 0.859
 *        Pixel Fold (2023)     2208x1840  -> 0.833
 *        OnePlus Open          2440x2268  -> 0.930
 *        Pixel 9 Pro Fold      2152x2076  -> 0.965
 *      Android phone shots (portrait OR landscape) sit at 0.46-0.56, a wide and
 *      stable gap below. Folded / cover-screen captures are even narrower and
 *      are deliberately left alone — they render fine in the phone column and
 *      aren't what this flag is for.
 *
 * The min-edge floor keeps square icons, logos, and other small square assets
 * out; anything near-square but below it is reported, never silently dropped.
 *
 * Usage:
 *   node scripts/mark-foldable-screenshots.mjs             # report only
 *   node scripts/mark-foldable-screenshots.mjs --write     # update frontmatter
 *
 * Run `node scripts/validate-frontmatter.mjs --fix` afterwards to restore the
 * quoting convention on filename keys.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import sharp from "sharp";
import { repoRoot } from "./lib/platforms.mjs";

// Foldables are an Android form factor. Scoping detection here is what keeps
// foldable_images and tablet_images (iPad-in-iOS) from ever overlapping.
const FOLDABLE_PLATFORMS = ["Android"];

// Nearly square. An unfolded inner display's short/long edge ratio is >= ~0.72
// across every current foldable (see header); phone shots sit far below at
// ~0.5. Orientation-independent, so it catches portrait and landscape captures
// alike.
const FOLDABLE_MIN_RATIO = 0.72;

// Below this short edge a near-square image is almost certainly an icon, logo,
// or other asset rather than a real inner-display capture. Native foldable
// captures have a short edge well over 1500px; the floor stays generous so a
// mildly downscaled contribution still qualifies.
const FOLDABLE_MIN_SHORT_EDGE = 800;

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif"]);
const KEY_ORDER = ["layout", "gallery-directory", "redirect_from", "tags", "tablet_images", "foldable_images", "image_tags"];

function orderKeys(obj) {
  const out = {};
  for (const k of KEY_ORDER) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
  return out;
}

async function classify(dir, files, tooSmall) {
  const foldables = [];
  for (const f of files) {
    try {
      const { width, height } = await sharp(path.join(dir, f)).metadata();
      if (!width || !height) continue;
      const shortEdge = Math.min(width, height);
      const ratio = shortEdge / Math.max(width, height);
      if (ratio < FOLDABLE_MIN_RATIO) continue;
      if (shortEdge < FOLDABLE_MIN_SHORT_EDGE) {
        tooSmall.push(`${f} (${width}x${height})`);
        continue;
      }
      foldables.push(f);
    } catch {
      // Unreadable image — leave it unclassified rather than guessing.
    }
  }
  return foldables.sort();
}

async function main() {
  const write = process.argv.includes("--write");
  const root = repoRoot();
  let changed = 0;
  let totalFoldables = 0;
  const skippedTooSmall = [];

  for (const platform of FOLDABLE_PLATFORMS) {
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
      const tooSmall = [];
      const foldables = await classify(dir, files, tooSmall);
      for (const s of tooSmall) skippedTooSmall.push(`${platform}/${entry.name}: ${s}`);

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

      const existing = Array.isArray(fm.foldable_images) ? fm.foldable_images : [];
      if (JSON.stringify(existing) === JSON.stringify(foldables)) continue;

      if (foldables.length) {
        fm.foldable_images = foldables;
        totalFoldables += foldables.length;
      } else {
        delete fm.foldable_images;
      }
      changed++;
      console.log(
        `  ${platform}/${entry.name}: ${foldables.length} foldable / ${files.length} images`
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
      `${totalFoldables} foldable screenshot(s) marked.`
  );
  if (skippedTooSmall.length) {
    console.log(
      `\n${skippedTooSmall.length} near-square image(s) skipped as below the ` +
        `${FOLDABLE_MIN_SHORT_EDGE}px short-edge floor (raise FOLDABLE_MIN_SHORT_EDGE if any are real captures):`
    );
    for (const s of skippedTooSmall) console.log(`  ${s}`);
  }
  if (!write && changed) console.log("\nRe-run with --write to apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
