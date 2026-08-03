#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { calculateTimestamps, formatTime, hammingDistance, parseYouTubeUrl, slugify, timestampToken } from "./capture-session.mjs";

const execFile = promisify(execFileCallback);
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "capture-session.mjs");

const accepted = [
  "https://www.youtube.com/watch?v=M7lc1UVf-VE",
  "https://youtu.be/M7lc1UVf-VE?t=5",
  "https://youtube.com/embed/M7lc1UVf-VE",
  "https://youtube.com/shorts/M7lc1UVf-VE",
  "https://youtube.com/live/M7lc1UVf-VE"
];

for (const url of accepted) {
  assert.deepEqual(parseYouTubeUrl(url), {
    videoId: "M7lc1UVf-VE",
    canonicalUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE"
  });
}

for (const url of ["https://example.com/watch?v=M7lc1UVf-VE", "https://youtube.com/watch?v=short", "not-a-url"]) {
  assert.throws(() => parseYouTubeUrl(url));
}

assert.equal(slugify("Crème SaaS / Dashboard"), "creme-saas-dashboard");
assert.equal(formatTime(3661), "01:01:01");
assert.equal(timestampToken(3661), "010101");
assert.equal(hammingDistance("0000000000000000", "000000000000000f"), 4);
assert.deepEqual(calculateTimestamps({ duration: 8, sampleCount: 60 }), [0.8, 7.2]);

const long = calculateTimestamps({ duration: 600, sampleCount: 60 });
assert.equal(long.length, 60);
assert.equal(long[0], 3);
assert.equal(long.at(-1), 597);

const range = calculateTimestamps({ duration: 100, start: 20, end: 30, sampleCount: 60 });
assert.deepEqual(range, [20, 25, 30]);

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "capture-saas-video-frames-test-"));
const init = await execFile(process.execPath, [script, "init", "--url", accepted[0], "--product", "Acme: Pro", "--root", temporaryRoot]);
const initialized = JSON.parse(init.stdout);
const sessionDir = initialized.sessionDir;
const candidates = path.join(sessionDir, "candidates");

await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#102040" } })
  .composite([{ input: Buffer.from('<svg width="900" height="400"><rect width="900" height="400" fill="#f5f7ff"/><circle cx="150" cy="180" r="80" fill="#6c7cff"/></svg>'), left: 100, top: 100 }])
  .png().toFile(path.join(candidates, "frame-001-t-000003000.png"));
await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#204010" } })
  .composite([{ input: Buffer.from('<svg width="900" height="400"><rect width="900" height="400" fill="#fff7f0"/><rect x="100" y="100" width="500" height="180" fill="#ff8855"/></svg>'), left: 600, top: 300 }])
  .png().toFile(path.join(candidates, "frame-002-t-000008000.png"));

const runner = JSON.parse((await execFile(process.execPath, [script, "runner", "--session", sessionDir, "--base-url", "http://localhost:8765/"])).stdout);
const runnerCode = await fs.readFile(runner.runnerPath, "utf8");
assert.match(runnerCode, /#player-shell/);
assert.equal(typeof new Function(`return (${runnerCode})`)(), "function");

const sheet = JSON.parse((await execFile(process.execPath, [script, "contact-sheet", "--session", sessionDir])).stdout);
assert.equal(sheet.candidates, 2);
assert.match(await fs.readFile(sheet.contactSheet, "utf8"), /Copy selected IDs/);

const staged = JSON.parse((await execFile(process.execPath, [script, "stage", "--session", sessionDir, "--select", "001,002"])).stdout);
assert.equal(staged.staged.length, 2);
assert.deepEqual(staged.staged.map((item) => item.filename), [
  "acme-pro__youtube-M7lc1UVf-VE__t-000003.png",
  "acme-pro__youtube-M7lc1UVf-VE__t-000008.png"
]);

const fakeRepo = path.join(temporaryRoot, "repo");
await fs.mkdir(path.join(fakeRepo, "Web"), { recursive: true });
await fs.writeFile(path.join(fakeRepo, "_config.yml"), "platforms: [Web]\n", "utf8");
const installed = JSON.parse((await execFile(process.execPath, [script, "install", "--session", sessionDir, "--repo", fakeRepo])).stdout);
assert.equal(installed.installed.length, 2);
assert.equal(installed.index.status, "created");
assert.match(await fs.readFile(installed.index.file, "utf8"), /gallery-directory: "Acme: Pro"/);

const secondInstall = JSON.parse((await execFile(process.execPath, [script, "install", "--session", sessionDir, "--repo", fakeRepo])).stdout);
assert.ok(secondInstall.installed.every((item) => item.status === "skipped-identical"));

await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#901020" } })
  .png().toFile(staged.staged[0].destination);
const collisionInstall = JSON.parse((await execFile(process.execPath, [script, "install", "--session", sessionDir, "--repo", fakeRepo])).stdout);
assert.equal(collisionInstall.installed[0].status, "copied");
assert.match(collisionInstall.installed[0].file, /-2\.png$/);
assert.equal(collisionInstall.installed[1].status, "skipped-identical");

await fs.rm(temporaryRoot, { recursive: true, force: true });

process.stdout.write("capture-session tests passed\n");
