// Hacker News "Show HN" adapter.
//
// Uses the public Algolia HN Search API (no auth, designed for this). We pull
// the most recent Show HN posts that link to an external URL — those are the
// self-submitted product launches. The product name is parsed out of the
// "Show HN: <name> – <tagline>" title convention.

import { fetchJson, clean } from "./util.mjs";

const ENDPOINT =
  "https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=100";

// "Show HN: Foo – a bar for baz" -> { name: "Foo", tagline: "a bar for baz" }
function parseTitle(title) {
  let t = clean(title).replace(/^show\s+hn:\s*/i, "");
  // Split on the first en/em dash or hyphen surrounded by spaces, or a colon.
  const m = t.match(/^(.*?)\s*(?:[–—-]|:)\s+(.*)$/);
  if (m) return { name: clean(m[1]), tagline: clean(m[2]) };
  return { name: t, tagline: "" };
}

export async function fetchCandidates() {
  const data = await fetchJson(ENDPOINT);
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  const out = [];
  for (const hit of hits) {
    // Skip self-posts (Ask-HN-style Show HNs with no external link) and dead
    // entries. We want the product's own URL.
    if (!hit.url || !hit.title) continue;
    const { name, tagline } = parseTitle(hit.title);
    if (!name) continue;
    out.push({ name, url: hit.url, source: "Show HN", tagline });
  }
  return out;
}
