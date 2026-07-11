// Product Hunt adapter.
//
// Reads Product Hunt's public RSS feed — a published, structured feed meant for
// automated consumption. This deliberately avoids two things: the GraphQL API
// (needs a token and carries a non-commercial clause) and scraping the site's
// HTML (forbidden by PH's ToS and brittle). The feed gives us product name,
// tagline, and the PH post link — enough for a discovery candidate. We never
// touch PH's images.
//
// The PH feed link points at the Product Hunt post page, not the product's own
// site. That's fine for a review manifest: a human clicks through to grab real
// screenshots. Other sources (HN/YC/GitHub) carry the product's own URL.

import { fetchText, clean, stripHtml, decodeEntities } from "./util.mjs";

const FEED_URL = "https://www.producthunt.com/feed";

// Minimal RSS/Atom item extractor. PH's feed is Atom (<entry>), but we also
// accept RSS (<item>) so the adapter survives a feed-format change.
function parseFeed(xml) {
  const items = [];
  const blockRe = /<(entry|item)\b[\s\S]*?<\/\1>/g;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[0];

    const titleRaw = tag(block, "title");
    // Atom: <link href="..."/> ; RSS: <link>...</link>
    let link =
      attr(block, "link", "href") || tag(block, "link") || "";
    const summary =
      tag(block, "summary") || tag(block, "description") || tag(block, "content") || "";

    const title = decodeEntities(clean(stripCdata(titleRaw)));
    if (!title) continue;

    // PH titles are the raw product name; the tagline lives in the summary.
    items.push({
      name: title,
      url: clean(decodeEntities(stripCdata(link))),
      tagline: stripHtml(stripCdata(summary)),
    });
  }
  return items;
}

function tag(block, name) {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i");
  const m = block.match(re);
  return m ? m[1] : "";
}

function attr(block, tagName, attrName) {
  const re = new RegExp(`<${tagName}\\b[^>]*\\b${attrName}="([^"]*)"[^>]*/?>`, "i");
  const m = block.match(re);
  return m ? m[1] : "";
}

function stripCdata(s) {
  return String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

export async function fetchCandidates() {
  const xml = await fetchText(FEED_URL, { headers: { Accept: "application/rss+xml, application/atom+xml, application/xml" } });
  const items = parseFeed(xml);
  return items
    .filter((it) => it.name)
    .map((it) => ({
      name: it.name,
      url: it.url,
      source: "Product Hunt",
      tagline: it.tagline,
    }));
}
