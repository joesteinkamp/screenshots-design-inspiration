/**
 * platforms.mjs
 *
 * Shared access to the platform taxonomy defined in _config.yml, so the Node
 * tooling reads the same list as the Jekyll build (see _plugins/platforms.rb).
 *
 * A platform is a top-level content directory — `<Platform>/<Product>/index.html`
 * — so this list also answers "which directories hold galleries".
 *
 * Missing or malformed config throws rather than defaulting: an empty list would
 * make every script silently find zero galleries and report success.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export function repoRoot() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
}

let cached = null;
let cachedConfig = null;

function readConfig(root) {
  if (cachedConfig) return cachedConfig;
  const configPath = path.join(root, "_config.yml");
  try {
    cachedConfig = yaml.load(fs.readFileSync(configPath, "utf-8")) || {};
  } catch (err) {
    throw new Error(`Could not read ${configPath}: ${err.message}`);
  }
  return cachedConfig;
}

export function loadPlatforms(root = repoRoot()) {
  if (cached) return cached;

  const platforms = readConfig(root).platforms;
  if (!Array.isArray(platforms) || platforms.length === 0) {
    throw new Error(
      `_config.yml \`platforms:\` must be a non-empty list of directory names ` +
        `(got ${JSON.stringify(platforms)})`
    );
  }
  for (const name of platforms) {
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(
        `_config.yml \`platforms:\` entries must be non-empty strings ` +
          `(got ${JSON.stringify(name)})`
      );
    }
  }

  cached = platforms;
  return cached;
}

/**
 * Platforms whose screenshots are phone-shaped, from `phone_platforms:`.
 *
 * Every entry must also appear in `platforms:`. Defaults to empty rather than
 * throwing: a site with no phone platforms is legitimate.
 */
export function loadPhonePlatforms(root = repoRoot()) {
  const raw = readConfig(root).phone_platforms;
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(
      `_config.yml \`phone_platforms:\` must be a list (got ${JSON.stringify(raw)})`
    );
  }
  const known = loadPlatforms(root);
  for (const name of raw) {
    if (!known.includes(name)) {
      throw new Error(
        `_config.yml \`phone_platforms:\` lists ${JSON.stringify(name)}, which is ` +
          `not in \`platforms:\` (${known.join(", ")})`
      );
    }
  }
  return raw;
}

/**
 * The platform a repo-relative path belongs to, or null if it isn't inside one.
 *
 * Matches the first path segment, never a substring — product folders such as
 * "T-Mobile" or "Universal Studios" contain platform names as substrings.
 */
export function platformFromPath(relPath, root = repoRoot()) {
  const first = relPath.split(path.sep).join("/").replace(/^\//, "").split("/")[0];
  return loadPlatforms(root).includes(first) ? first : null;
}
