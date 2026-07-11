// Y Combinator adapter.
//
// Consumes the community `yc-oss/api` JSON (regenerated daily from YC's public
// company index) rather than crawling YC itself — so there's no scraping and
// no auth. We take the most recent batches, since those are the freshest
// products, and keep companies that expose a website.

import { fetchJson, clean } from "./util.mjs";

const ALL_COMPANIES = "https://yc-oss.github.io/api/companies/all.json";
// How many of the most-recent batches to include. Two batches is plenty of
// fresh candidates for a weekly run once dedupe trims the known ones.
const RECENT_BATCHES = 2;

// Order seasons within a year so batch recency sorts correctly.
const SEASON_ORDER = { winter: 0, spring: 1, summer: 2, fall: 3 };
const CODE_SEASON = { W: "winter", X: "spring", S: "summer", F: "fall" };

// Turn a batch label into a sortable number. Handles both full names
// ("Winter 2025") and short codes ("W25"). Unknown formats sort oldest.
function batchScore(batch) {
  const b = clean(batch);
  let year, season;

  let m = b.match(/^(winter|spring|summer|fall)\s+(\d{4})$/i);
  if (m) {
    season = m[1].toLowerCase();
    year = parseInt(m[2], 10);
  } else if ((m = b.match(/^([WXSF])(\d{2})$/i))) {
    season = CODE_SEASON[m[1].toUpperCase()];
    year = 2000 + parseInt(m[2], 10);
  } else {
    return -1;
  }
  return year * 10 + (SEASON_ORDER[season] ?? 0);
}

export async function fetchCandidates() {
  const companies = await fetchJson(ALL_COMPANIES);
  if (!Array.isArray(companies)) return [];

  // Rank the distinct batches and keep only the most recent ones.
  const scoreByBatch = new Map();
  for (const c of companies) {
    if (c.batch && !scoreByBatch.has(c.batch)) {
      scoreByBatch.set(c.batch, batchScore(c.batch));
    }
  }
  const recentBatches = new Set(
    [...scoreByBatch.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, RECENT_BATCHES)
      .map(([batch]) => batch)
  );

  const out = [];
  for (const c of companies) {
    if (!recentBatches.has(c.batch)) continue;
    if (!c.website || !/^https?:\/\//i.test(c.website)) continue;
    out.push({
      name: clean(c.name),
      url: c.website.trim(),
      source: `YC ${clean(c.batch)}`,
      tagline: clean(c.one_liner),
    });
  }
  return out;
}
