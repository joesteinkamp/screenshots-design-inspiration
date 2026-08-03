---
name: find-saas-demo-videos
description: Find and rank current YouTube demos, product tours, walkthroughs, and UI-flow videos for named SaaS products, product categories, or software workflows. Use for product research, design research, competitive scans, or requests for videos that visibly demonstrate SaaS interfaces. Do not use for downloading videos, summarizing one supplied video, or general non-SaaS video search.
---

# Find SaaS Demo Videos

Build an evidence-backed shortlist of YouTube videos that show real SaaS product UI. Prefer current official demos, but retain stronger independent walkthroughs when they reveal more of the product.

## Interpret the Request

1. Accept any of these targets:
   - one or more named SaaS products;
   - a SaaS category;
   - a product workflow or UI pattern.
2. Infer the target, feature, audience, language, freshness, duration, and result count from the request and conversation.
3. Default to English and 8 results. Accept an explicit count from 1 to 20.
4. Ask one concise question only when no product, category, or workflow can be inferred.

## Discover Candidates

1. Use the strongest available web-search or browser-search tool. Do not require credentials.
2. For a named product, search these query families:
   - `"<product>" demo` and `"<product>" product tour`;
   - `"<product>" walkthrough` and `"<product>" software demo`;
   - `"<product>" "<requested feature>" demo` when a feature is named;
   - the vendor's official site and official YouTube channel.
3. For a category or workflow, first identify relevant SaaS products, then run product-specific queries. If this repository's screenshot-inspiration tools are available, use `search_inspiration`, `search_by_tags`, or `browse_by_platform` to seed product names; do not restrict the search to that catalog.
4. Add `site:youtube.com/watch` when a search engine returns noisy non-video results. Search YouTube directly when browser access is stronger than web search.
5. Gather about 3 times the requested count before ranking, or stop after exhausting the query families. Do not request a YouTube API key. Use an already-configured YouTube data tool only as optional metadata enrichment.

## Verify Every Finalist

Open every shortlisted YouTube page and record only facts supported by the page or a corroborating official source:

- canonical URL in the form `https://www.youtube.com/watch?v=<video-id>`;
- exact title and channel name;
- publication date and duration;
- product and demonstrated workflows;
- evidence that the video shows product UI;
- publisher status: `Official`, `Independent`, or `Unverified`.

Treat a channel as official only when the vendor links to it, the channel links to the vendor's domain, or YouTube visibly establishes the identity. State `Unverified` when evidence is insufficient. Mark unavailable metadata as `Unknown`; never infer it.

Reject:

- private, deleted, region-blocked, or otherwise unavailable videos;
- duplicate video IDs, including alternate `youtu.be`, embed, live, or tracking URLs;
- YouTube Shorts;
- trailers, ads, launch teasers, and talking-head content without meaningful product UI;
- podcasts, conference talks, or webinars that do not demonstrate the product;
- videos unrelated to the requested product, category, or workflow.

## Score and Rank

Score each eligible candidate out of 100 using only these buckets:

| Dimension | Points | Rule |
| --- | ---: | --- |
| Demonstration depth | 0 / 10 / 25 / 35 | None; incidental UI; focused live workflow; end-to-end or multi-feature UI demo |
| Publisher authority | 0 / 8 / 15 / 25 | Unknown; identifiable uploader; credible independent specialist; verified official source |
| Freshness | 0 / 4 / 12 / 20 | Unknown; over 36 months; 19–36 months; 18 months or newer |
| Request fit | 0 / 5 / 10 / 15 | Unrelated; category-adjacent; correct product; exact product plus requested feature/workflow |
| Watchability | 0 / 2 / 5 | Unplayable; playable but poorly described or impractical length; playable, clear, and useful length |

Exclude any candidate with 0 demonstration-depth points or 0 watchability points. Sort by total score, then demonstration depth, freshness, publisher authority, and publication date. For category searches, include at most 2 videos per product. For multiple named products, include at least one eligible result per product before adding additional results.

Prefer recent videos, but keep an older video when it is materially more complete. Label every video older than 36 months `Older UI risk`. An independent walkthrough may outrank an official video when its additional demonstration depth outweighs the authority difference.

## Produce the Report

1. Copy and complete [assets/report-template.html](assets/report-template.html). Replace every `{{PLACEHOLDER}}` and template comment; do not leave sample content behind.
2. Write one self-contained HTML file under `/tmp/find-saas-demo-videos/<target-slug>-<YYYY-MM-DD>.html`. Embed all CSS and use no remote scripts, fonts, images, or trackers.
3. HTML-escape all sourced text before inserting it. Put only the verified canonical YouTube URL in each result link.
4. Include:
   - the interpreted brief and applied filters;
   - the ranked results with title, direct link, product, channel, publisher status, date, duration, score, demonstrated flows, rationale, and freshness warning;
   - a coverage note with attempted query families and any gaps;
   - the scoring method and generation date.
5. If fewer than 5 eligible results exist, return the smaller honest set and explain the coverage gap. If none exist, still produce the report with the attempted searches and suggested broader query.
6. Serve or open the artifact through an existing localhost artifact server when available. Otherwise start at most one temporary server from the integration checkout, report its URL and filesystem path, and keep its session available to stop. Never start a second repository dev server.
7. Return a concise chat handoff containing the top pick and the report link. Do not dump the full shortlist into chat.

## Boundaries

- Find and rank videos; do not download streams, bypass playback restrictions, or retrieve private media.
- Do not produce transcripts or detailed single-video summaries unless the user asks in a separate task.
- Distinguish observed evidence from inference. Use `Unknown` or `Unverified` instead of filling gaps.
- Treat search results as time-sensitive and perform a fresh search on every run.
