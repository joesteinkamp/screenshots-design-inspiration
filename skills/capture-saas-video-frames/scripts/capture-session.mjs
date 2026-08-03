#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, "..");
const DEFAULT_ROOT = "/tmp/screenshots-design-inspiration-video-capture";
const PLATFORMS = new Set(["Web", "iOS", "Android", "Email"]);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    values[key] = value;
    index += 1;
  }
  return { command, values };
}

export function parseYouTubeUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Provide a valid absolute YouTube URL.");
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let videoId = "";
  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v") || "";
    else {
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0])) videoId = parts[1] || "";
    }
  } else {
    throw new Error("Only youtube.com and youtu.be URLs are supported.");
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("The URL does not contain a valid 11-character YouTube video ID.");
  return { videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}` };
}

function safeProductName(input) {
  const product = String(input || "").trim();
  if (!product) throw new Error("Provide a product name with --product.");
  if (product === "." || product === ".." || /[\\/\u0000-\u001f\u007f]/.test(product)) {
    throw new Error("Product names cannot contain path separators or control characters.");
  }
  return product;
}

function slugify(input) {
  const slug = input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "product";
}

function numericOption(value, fallback, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return parsed;
}

function sessionId(product, videoId) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${slugify(product)}-${videoId}-${stamp}`;
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readSession(sessionDir) {
  const absolute = path.resolve(sessionDir);
  const session = JSON.parse(await fs.readFile(path.join(absolute, "session.json"), "utf8"));
  if (path.resolve(session.sessionDir) !== absolute) throw new Error("Session path does not match session.json.");
  return session;
}

function calculateTimestamps({ duration, start, end, sampleCount = 60 }) {
  const safeDuration = numericOption(duration, undefined, { min: 0.001 });
  const safeStart = start === undefined ? (safeDuration > 8 ? 3 : safeDuration * 0.1) : numericOption(start, 0, { min: 0, max: safeDuration });
  const safeEnd = end === undefined ? (safeDuration > 8 ? safeDuration - 3 : safeDuration * 0.9) : numericOption(end, safeDuration, { min: safeStart, max: safeDuration });
  const requested = numericOption(sampleCount, 60, { min: 1, max: 60, integer: true });
  const span = safeEnd - safeStart;
  if (span === 0) return [Number(safeStart.toFixed(3))];
  const count = Math.min(requested, Math.max(2, Math.floor(span / 5) + 1));
  return Array.from({ length: count }, (_, index) => Number((safeStart + (span * index) / (count - 1)).toFixed(3)));
}

async function initSession(values) {
  const source = parseYouTubeUrl(values.url);
  const product = safeProductName(values.product);
  const platform = values.platform || "Web";
  if (!PLATFORMS.has(platform)) throw new Error(`Unsupported platform: ${platform}`);
  const maxFinal = numericOption(values["max-final"], 12, { min: 1, max: 60, integer: true });
  const sampleCount = numericOption(values["sample-count"], 60, { min: 1, max: 60, integer: true });
  const start = values.start === undefined ? undefined : numericOption(values.start, 0, { min: 0 });
  const end = values.end === undefined ? undefined : numericOption(values.end, 0, { min: 0 });
  if (start !== undefined && end !== undefined && end < start) throw new Error("--end must be greater than or equal to --start.");
  const root = path.resolve(values.root || DEFAULT_ROOT);
  const id = sessionId(product, source.videoId);
  const dir = path.join(root, id);
  await fs.mkdir(path.join(dir, "candidates"), { recursive: true });
  await fs.mkdir(path.join(dir, "approved"), { recursive: true });
  const session = {
    schemaVersion: 1,
    id,
    sessionDir: dir,
    sourceUrl: source.canonicalUrl,
    videoId: source.videoId,
    product,
    productSlug: slugify(product),
    platform,
    maxFinal,
    sampling: { sampleCount, start, end },
    createdAt: new Date().toISOString()
  };
  await writeJson(path.join(dir, "session.json"), session);
  return {
    sessionDir: dir,
    sessionFile: path.join(dir, "session.json"),
    videoId: session.videoId,
    harnessPath: path.join(SKILL_DIR, "assets", "capture.html"),
    next: `Serve ${SKILL_DIR}, then run the runner command with its base URL.`
  };
}

function escapeForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

async function generateRunner(values) {
  const session = await readSession(values.session);
  const baseUrl = new URL(values["base-url"] || "http://localhost:8765/");
  if (!/^https?:$/.test(baseUrl.protocol)) throw new Error("--base-url must use http or https.");
  const harnessUrl = new URL("assets/capture.html", baseUrl);
  harnessUrl.searchParams.set("video", session.videoId);
  const runnerPath = path.join(session.sessionDir, "capture.run-code.js");
  const code = `async (page) => {
  const sessionDir = ${escapeForScript(session.sessionDir)};
  const harnessUrl = ${escapeForScript(harnessUrl.toString())};
  const sampling = ${escapeForScript(session.sampling)};
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(harnessUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.saasCapture?.isReady(), null, { timeout: 30000 });
  const playerError = await page.evaluate(() => window.saasCapture.error());
  if (playerError) throw new Error(playerError);
  await page.waitForFunction(() => window.saasCapture.duration() > 0 || window.saasCapture.error(), null, { timeout: 30000 });
  const durationError = await page.evaluate(() => window.saasCapture.error());
  if (durationError) throw new Error(durationError);
  const duration = await page.evaluate(() => window.saasCapture.duration());
  const timestamps = (() => {
    const start = sampling.start ?? (duration > 8 ? 3 : duration * 0.1);
    const end = sampling.end ?? (duration > 8 ? duration - 3 : duration * 0.9);
    if (!(duration > 0) || start < 0 || end < start || end > duration) throw new Error("Invalid video duration or sample range.");
    const span = end - start;
    if (span === 0) return [Number(start.toFixed(3))];
    const count = Math.min(sampling.sampleCount, Math.max(2, Math.floor(span / 5) + 1));
    return Array.from({ length: count }, (_, i) => Number((start + span * i / (count - 1)).toFixed(3)));
  })();
  const captures = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const requested = timestamps[index];
    const result = await page.evaluate((seconds) => window.saasCapture.captureAt(seconds), requested);
    const frameId = String(index + 1).padStart(3, "0");
    const milliseconds = String(Math.round(result.actual * 1000)).padStart(9, "0");
    const file = \`\${sessionDir}/candidates/frame-\${frameId}-t-\${milliseconds}.png\`;
    await page.locator("#player-shell").screenshot({ path: file, animations: "disabled" });
    captures.push({ frameId, file, requested, actual: result.actual });
  }
  return { duration, captures };
}`;
  await fs.writeFile(runnerPath, `${code}\n`, "utf8");
  return {
    runnerPath,
    harnessUrl: harnessUrl.toString(),
    commands: [
      "playwright-cli -s=saas-video-capture open about:blank",
      `playwright-cli -s=saas-video-capture run-code --filename ${JSON.stringify(runnerPath)}`,
      "playwright-cli -s=saas-video-capture close"
    ]
  };
}

function hammingDistance(left, right) {
  assert.equal(left.length, right.length);
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = parseInt(left[index], 16) ^ parseInt(right[index], 16);
    while (value) {
      distance += value & 1;
      value >>>= 1;
    }
  }
  return distance;
}

async function fingerprint(file) {
  const { data } = await sharp(file).resize(9, 8, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      bits += data[row * 9 + column] > data[row * 9 + column + 1] ? "1" : "0";
    }
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

function parseFrameFilename(filename) {
  const match = /^frame-(\d{3})-t-(\d{9})\.png$/i.exec(filename);
  if (!match) return null;
  return { frameId: match[1], seconds: Number(match[2]) / 1000 };
}

function formatTime(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

async function inspectFrames(session) {
  const candidateDir = path.join(session.sessionDir, "candidates");
  const files = (await fs.readdir(candidateDir)).filter((file) => parseFrameFilename(file)).sort();
  if (!files.length) throw new Error("No candidate PNGs were found. Run the capture routine first.");
  const frames = [];
  for (const filename of files) {
    const file = path.join(candidateDir, filename);
    const parsed = parseFrameFilename(filename);
    const [metadata, stats, hash, thumbnail] = await Promise.all([
      sharp(file).metadata(),
      sharp(file).stats(),
      fingerprint(file),
      sharp(file).resize({ width: 560, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer()
    ]);
    const meanDeviation = stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / Math.min(3, stats.channels.length);
    const blank = stats.entropy < 1 || meanDeviation < 5;
    let duplicateOf = null;
    for (const previous of frames) {
      if (hammingDistance(hash, previous.hash) <= 6) {
        duplicateOf = previous.frameId;
        break;
      }
    }
    frames.push({
      ...parsed,
      filename,
      file,
      width: metadata.width,
      height: metadata.height,
      entropy: Number(stats.entropy.toFixed(3)),
      meanDeviation: Number(meanDeviation.toFixed(3)),
      hash,
      blank,
      duplicateOf,
      thumbnail: `data:image/jpeg;base64,${thumbnail.toString("base64")}`
    });
  }
  return frames;
}

function contactSheetHtml(session, frames) {
  const cards = frames.map((frame) => {
    const flags = [frame.blank ? "likely blank" : "", frame.duplicateOf ? `near duplicate of ${frame.duplicateOf}` : ""].filter(Boolean);
    return `<article class="frame${flags.length ? " flagged" : ""}" data-frame-id="${frame.frameId}">
      <label><input type="checkbox" value="${frame.frameId}"${flags.length ? "" : " checked"}> <strong>${frame.frameId}</strong> · ${formatTime(frame.seconds)}</label>
      <img src="${frame.thumbnail}" alt="Candidate frame ${frame.frameId} at ${formatTime(frame.seconds)}">
      <p>${frame.width}×${frame.height} · entropy ${frame.entropy}${flags.length ? ` · <span>${escapeHtml(flags.join("; "))}</span>` : ""}</p>
    </article>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(session.product)} video contact sheet</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#111;color:#eee}body{margin:0;padding:24px}header{position:sticky;top:0;z-index:2;background:#111e;padding:0 0 16px;backdrop-filter:blur(12px)}h1{margin:0 0 6px}p{color:#aaa}.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}button{font:inherit;padding:9px 14px;border:0;border-radius:8px;background:#6c7cff;color:white;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:18px}.frame{border:1px solid #343434;border-radius:12px;padding:12px;background:#1a1a1a}.frame:has(input:checked){border-color:#6c7cff;box-shadow:0 0 0 1px #6c7cff}.frame.flagged{opacity:.72}.frame img{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#000;margin:10px 0;border-radius:6px}.frame p{font-size:13px;margin:0}.frame span{color:#ffbb80}code{color:#b9c0ff}
</style></head><body>
<header><h1>${escapeHtml(session.product)}</h1><p>YouTube <code>${session.videoId}</code> · ${frames.length} candidates · choose no more than ${session.maxFinal}</p><div class="actions"><button id="copy">Copy selected IDs</button><button id="clear">Clear</button><strong id="count"></strong></div></header>
<main class="grid">${cards}</main>
<script>
const boxes=[...document.querySelectorAll('input[type="checkbox"]')];const count=document.querySelector('#count');
function selected(){return boxes.filter(x=>x.checked).map(x=>x.value)}function update(){count.textContent=selected().length+' selected';}boxes.forEach(x=>x.addEventListener('change',update));
document.querySelector('#clear').addEventListener('click',()=>{boxes.forEach(x=>x.checked=false);update()});
document.querySelector('#copy').addEventListener('click',async()=>{const value=selected().join(',');if(!value){count.textContent='Nothing selected';return}try{await navigator.clipboard.writeText(value);count.textContent='Copied '+value}catch{window.prompt('Copy selected frame IDs',value)}});update();
</script></body></html>`;
}

async function buildContactSheet(values) {
  const session = await readSession(values.session);
  const frames = await inspectFrames(session);
  const output = path.join(session.sessionDir, "contact-sheet.html");
  await fs.writeFile(output, contactSheetHtml(session, frames), "utf8");
  await writeJson(path.join(session.sessionDir, "candidates.json"), frames.map(({ thumbnail, ...frame }) => frame));
  return {
    contactSheet: output,
    candidates: frames.length,
    likelyBlank: frames.filter((frame) => frame.blank).map((frame) => frame.frameId),
    nearDuplicates: frames.filter((frame) => frame.duplicateOf).map((frame) => ({ frameId: frame.frameId, duplicateOf: frame.duplicateOf }))
  };
}

function selectedIds(value, maxFinal) {
  const ids = [...new Set(String(value || "").split(",").map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new Error("Select at least one frame ID with --select.");
  if (ids.length > maxFinal) throw new Error(`Select no more than ${maxFinal} frames.`);
  for (const id of ids) if (!/^\d{3}$/.test(id)) throw new Error(`Invalid frame ID: ${id}`);
  return ids;
}

function timestampToken(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join("");
}

async function clearDirectoryFiles(directory) {
  for (const entry of await fs.readdir(directory)) {
    const file = path.join(directory, entry);
    if ((await fs.lstat(file)).isFile()) await fs.unlink(file);
  }
}

async function stageFrames(values) {
  const session = await readSession(values.session);
  const ids = selectedIds(values.select, session.maxFinal);
  const frames = await inspectFrames(session);
  const byId = new Map(frames.map((frame) => [frame.frameId, frame]));
  const approvedDir = path.join(session.sessionDir, "approved");
  await clearDirectoryFiles(approvedDir);
  const staged = [];
  for (const id of ids) {
    const frame = byId.get(id);
    if (!frame) throw new Error(`Candidate frame ${id} does not exist.`);
    const filename = `${session.productSlug}__youtube-${session.videoId}__t-${timestampToken(frame.seconds)}.png`;
    const destination = path.join(approvedDir, filename);
    await sharp(frame.file).png().toFile(destination);
    staged.push({ frameId: id, source: frame.file, filename, destination, seconds: frame.seconds });
  }
  await writeJson(path.join(session.sessionDir, "approved.json"), staged);
  return { approvedDir, proposedDestination: `${session.platform}/${session.product}`, staged };
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function uniqueDestination(directory, filename, sourceHash) {
  const parsed = path.parse(filename);
  for (let suffix = 1; ; suffix += 1) {
    const candidate = path.join(directory, suffix === 1 ? filename : `${parsed.name}-${suffix}${parsed.ext}`);
    try {
      const existingHash = await sha256(candidate);
      if (existingHash === sourceHash) return { candidate, identical: true };
    } catch (error) {
      if (error.code === "ENOENT") return { candidate, identical: false };
      throw error;
    }
  }
}

async function installFrames(values) {
  const session = await readSession(values.session);
  const repo = path.resolve(values.repo || process.cwd());
  const approvedFile = path.join(session.sessionDir, "approved.json");
  const approved = JSON.parse(await fs.readFile(approvedFile, "utf8"));
  if (!approved.length) throw new Error("No approved frames are staged.");
  const platformDir = path.join(repo, session.platform);
  const productDir = path.join(platformDir, session.product);
  const relativeProduct = path.relative(platformDir, productDir);
  if (relativeProduct.startsWith("..") || path.isAbsolute(relativeProduct)) throw new Error("Resolved product path escapes the platform directory.");
  await fs.access(path.join(repo, "_config.yml"));
  await fs.mkdir(productDir, { recursive: true });
  const installed = [];
  for (const item of approved) {
    const sourceHash = await sha256(item.destination);
    const { candidate, identical } = await uniqueDestination(productDir, item.filename, sourceHash);
    if (!identical) await fs.copyFile(item.destination, candidate, fs.constants.COPYFILE_EXCL);
    installed.push({ file: candidate, status: identical ? "skipped-identical" : "copied" });
  }
  const indexPath = path.join(productDir, "index.html");
  let indexStatus = "preserved";
  try {
    await fs.access(indexPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.writeFile(indexPath, `---\nlayout: gallery\ngallery-directory: ${JSON.stringify(session.product)}\n---\n`, { encoding: "utf8", flag: "wx" });
    indexStatus = "created";
  }
  return { productDir, index: { file: indexPath, status: indexStatus }, installed };
}

function usage() {
  return `Usage:
  capture-session.mjs init --url URL --product NAME [--platform Web] [--max-final 12] [--sample-count 60] [--start SEC] [--end SEC]
  capture-session.mjs runner --session DIR --base-url http://localhost:8765/
  capture-session.mjs contact-sheet --session DIR
  capture-session.mjs stage --session DIR --select 001,007,014
  capture-session.mjs install --session DIR [--repo PATH]`;
}

async function main() {
  const { command, values } = parseArgs(process.argv.slice(2));
  let result;
  if (command === "init") result = await initSession(values);
  else if (command === "runner") result = await generateRunner(values);
  else if (command === "contact-sheet") result = await buildContactSheet(values);
  else if (command === "stage") result = await stageFrames(values);
  else if (command === "install") result = await installFrames(values);
  else throw new Error(usage());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export { calculateTimestamps, formatTime, hammingDistance, slugify, timestampToken };
