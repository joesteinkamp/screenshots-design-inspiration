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

export function loadPlatforms(root = repoRoot()) {
  if (cached) return cached;

  const configPath = path.join(root, "_config.yml");
  let config;
  try {
    config = yaml.load(fs.readFileSync(configPath, "utf-8")) || {};
  } catch (err) {
    throw new Error(`Could not read ${configPath}: ${err.message}`);
  }

  const platforms = config.platforms;
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
 * The platform a repo-relative path belongs to, or null if it isn't inside one.
 *
 * Matches the first path segment, never a substring — product folders such as
 * "T-Mobile" or "Universal Studios" contain platform names as substrings.
 */
export function platformFromPath(relPath, root = repoRoot()) {
  const first = relPath.split(path.sep).join("/").replace(/^\//, "").split("/")[0];
  return loadPlatforms(root).includes(first) ? first : null;
}
