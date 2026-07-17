// GitHub adapter.
//
// Uses the GitHub Search API to find recently-created, well-starred repos that
// declare a `homepage` — those homepages are typically the product's own
// landing page (a real, screenshotable URL). Auth via GITHUB_TOKEN (the
// built-in Actions token works) lifts the rate limit from 10 to 30 req/min;
// unauthenticated still works for the single request we make.

import { fetchJson, clean } from "./util.mjs";

// Repos created within the last N days, sorted by stars. Kept broad; the
// engine's per-run cap and dedupe do the final trimming.
const LOOKBACK_DAYS = 45;
const MIN_STARS = 75;

function sinceDate(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function looksLikeUrl(s) {
  return typeof s === "string" && /^https?:\/\/\S+\.\S+/.test(s.trim());
}

// Homepages on these hosts are docs/papers/repos, never a product's own
// landing page — drop them so the manifest stays product-focused.
const NON_PRODUCT_HOSTS = /(^|\.)(github\.io|github\.com|gitlab\.com|arxiv\.org|npmjs\.com|pypi\.org)$/i;

function isProductHomepage(url) {
  try {
    return !NON_PRODUCT_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function fetchCandidates() {
  const q = encodeURIComponent(
    `created:>${sinceDate(LOOKBACK_DAYS)} stars:>=${MIN_STARS}`
  );
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=50`;

  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const data = await fetchJson(url, { headers });
  const items = Array.isArray(data?.items) ? data.items : [];
  const out = [];
  for (const repo of items) {
    // Require a real homepage — a bare GitHub repo isn't a "product" for this
    // gallery, but a repo whose homepage is a live app/landing page is.
    if (!looksLikeUrl(repo.homepage) || !isProductHomepage(repo.homepage)) continue;
    out.push({
      name: clean(repo.name),
      url: repo.homepage.trim(),
      source: "GitHub",
      tagline: clean(repo.description),
    });
  }
  return out;
}
