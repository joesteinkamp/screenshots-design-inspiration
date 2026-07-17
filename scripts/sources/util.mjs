// Shared helpers for the discovery-source adapters.
//
// Every adapter is a plain async function returning candidate objects of the
// shape { name, url, source, tagline }. These helpers keep the network calls
// resilient (timeout + exponential-backoff retry) so one flaky source never
// takes down a scheduled crawl — the caller logs and skips a source that
// throws.

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1500; // 1.5s, 3s, 6s

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A descriptive UA is polite and, for the GitHub/Algolia APIs, expected.
export const USER_AGENT =
  "screenshots-design-inspiration-crawler (+https://github.com/joesteinkamp/screenshots-design-inspiration)";

function isTransient(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function fetchWithRetry(url, opts = {}) {
  const headers = { "User-Agent": USER_AGENT, ...(opts.headers || {}) };
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs || DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...opts, headers, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        if (isTransient(res.status) && attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const retriable =
        err.name === "AbortError" ||
        /fetch failed|network|econnreset|timeout/i.test(String(err.message));
      if (retriable && attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function fetchJson(url, opts = {}) {
  const res = await fetchWithRetry(url, opts);
  return res.json();
}

export async function fetchText(url, opts = {}) {
  const res = await fetchWithRetry(url, opts);
  return res.text();
}

// Collapse whitespace and trim. Handy for titles pulled from RSS/HTML.
export function clean(str) {
  return String(str || "").replace(/\s+/g, " ").trim();
}

// Decode the handful of XML/HTML entities that show up in RSS titles and
// descriptions. Not a full entity table — just the common ones plus numeric
// escapes, which is all the feeds we read actually emit.
export function decodeEntities(str) {
  return String(str || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&"); // last, so "&amp;lt;" doesn't double-decode
}

// Strip HTML tags from a snippet (RSS descriptions are often HTML).
export function stripHtml(str) {
  return clean(decodeEntities(String(str || "").replace(/<[^>]*>/g, " ")));
}
