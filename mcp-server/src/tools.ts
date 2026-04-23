import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fetchIndex,
  buildTagIndex,
  buildScreenshotTagIndex,
  imageUrl,
  fetchImageAsBase64,
  productSummary,
} from "./data.js";
import type { Product } from "./types.js";

export function registerTools(server: McpServer) {
  // 1. search_by_tags
  server.tool(
    "search_by_tags",
    "Search for products by design tags (e.g. 'Dark Mode', 'Minimalist', 'SaaS Dashboard'). Use list_tags first to see available tags.",
    {
      tags: z.array(z.string()).describe("Tags to search for"),
      match: z
        .enum(["all", "any"])
        .default("any")
        .describe("Match all tags or any tag"),
    },
    async ({ tags, match }) => {
      const index = await fetchIndex();
      const searchTags = tags.map((t) => t.toLowerCase());

      const matches = index.products.filter((product) => {
        const productTags = product.tags.map((t) => t.toLowerCase());
        if (match === "all") {
          return searchTags.every((st) =>
            productTags.some((pt) => pt.includes(st) || st.includes(pt))
          );
        } else {
          return searchTags.some((st) =>
            productTags.some((pt) => pt.includes(st) || st.includes(pt))
          );
        }
      });

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No products found matching tags: ${tags.join(", ")}. Use list_tags to see available tags.`,
            },
          ],
        };
      }

      const results = matches.map((p) =>
        productSummary(p, index.base_url)
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: results.length, products: results },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 2. get_product_screenshots
  server.tool(
    "get_product_screenshots",
    "Get screenshots for a specific product. By default returns base64 images for in-chat viewing; set include_images=false to get just metadata + download URLs (no base64). To save images to disk, call with include_images=false and fetch each download_url with your own tools.",
    {
      product: z.string().describe("Product name (e.g. 'Airbnb', 'Stripe')"),
      platform: z
        .enum(["Web", "Mobile", "Email"])
        .optional()
        .describe("Filter by platform"),
      limit: z
        .number()
        .min(1)
        .max(10)
        .default(4)
        .describe("Number of images to return (default 4, max 10)"),
      include_images: z
        .boolean()
        .default(true)
        .describe("When false, skip base64 image payloads and return metadata + download URLs only. Use this when saving to disk or when you only need URLs."),
    },
    async ({ product, platform, limit, include_images }) => {
      const index = await fetchIndex();
      const searchName = product.toLowerCase();

      const match = index.products.find((p) => {
        const nameMatch = p.name.toLowerCase() === searchName;
        const platformMatch = !platform || p.platform === platform;
        return nameMatch && platformMatch;
      });

      if (!match) {
        // Try partial match
        const partials = index.products.filter((p) => {
          const nameMatch = p.name.toLowerCase().includes(searchName);
          const platformMatch = !platform || p.platform === platform;
          return nameMatch && platformMatch;
        });

        if (partials.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Product "${product}" not found. Use browse_by_platform or search_by_tags to find products.`,
              },
            ],
          };
        }

        if (partials.length > 1) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Multiple matches for "${product}": ${partials.map((p) => `${p.name} (${p.platform})`).join(", ")}. Please be more specific.`,
              },
            ],
          };
        }

        // Single partial match — use it
        return await fetchProductImages(partials[0], index.base_url, limit, include_images);
      }

      return await fetchProductImages(match, index.base_url, limit, include_images);
    }
  );

  // 3. browse_by_platform
  server.tool(
    "browse_by_platform",
    "List all products for a platform (Web, Mobile, or Email). Returns metadata only — use get_product_screenshots to see images.",
    {
      platform: z.enum(["Web", "Mobile", "Email"]).describe("Platform to browse"),
      limit: z.number().min(1).max(100).default(20).describe("Results per page"),
      offset: z.number().min(0).default(0).describe("Offset for pagination"),
    },
    async ({ platform, limit, offset }) => {
      const index = await fetchIndex();
      const filtered = index.products.filter((p) => p.platform === platform);
      const page = filtered.slice(offset, offset + limit);
      const results = page.map((p) => productSummary(p, index.base_url));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                platform,
                total: filtered.length,
                offset,
                limit,
                count: results.length,
                products: results,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 4. search_inspiration
  server.tool(
    "search_inspiration",
    "Search for UI design inspiration. Supply at least one of: a free-text query, product_tags, or screenshot_tags. Filters compose — e.g. product_tags=['AI-first'] + screenshot_tags=['Dashboard'] returns AI-first products that have at least one Dashboard-tagged screenshot. Use list_tags to discover available tags.",
    {
      query: z
        .string()
        .optional()
        .describe("Free-text query across product names, product tags, and screenshot tags (e.g. 'onboarding flow')"),
      product_tags: z
        .array(z.string())
        .optional()
        .describe("Narrow to products whose product-level tags match these (case-insensitive, substring match)"),
      screenshot_tags: z
        .array(z.string())
        .optional()
        .describe("Narrow to products that have at least one screenshot tagged with these"),
      tag_match: z
        .enum(["all", "any"])
        .default("all")
        .describe("Within each tag array, require all tags to match or any"),
      platform: z
        .enum(["Web", "Mobile", "Email"])
        .optional()
        .describe("Filter by platform"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .describe("Max results to return"),
    },
    async ({ query, product_tags, screenshot_tags, tag_match, platform, limit }) => {
      if (!query && (!product_tags || product_tags.length === 0) && (!screenshot_tags || screenshot_tags.length === 0)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide at least one of: query, product_tags, or screenshot_tags.",
            },
          ],
        };
      }

      const index = await fetchIndex();
      const keywords = (query || "")
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1);

      const productTagNeedles = (product_tags || []).map((t) => t.toLowerCase());
      const screenshotTagNeedles = (screenshot_tags || []).map((t) => t.toLowerCase());

      const tagMatches = (
        needles: string[],
        haystack: string[]
      ): boolean => {
        if (needles.length === 0) return true;
        const check = (n: string) =>
          haystack.some((h) => h.includes(n) || n.includes(h));
        return tag_match === "all" ? needles.every(check) : needles.some(check);
      };

      const scored = index.products
        .filter((p) => !platform || p.platform === platform)
        .filter((p) => {
          const lowerProductTags = p.tags.map((t) => t.toLowerCase());
          if (!tagMatches(productTagNeedles, lowerProductTags)) return false;

          if (screenshotTagNeedles.length > 0) {
            const allScreenshotTags = p.image_tags
              ? Object.values(p.image_tags).flat().map((t) => t.toLowerCase())
              : [];
            if (!tagMatches(screenshotTagNeedles, allScreenshotTags)) return false;
          }
          return true;
        })
        .map((p) => {
          let score = 0;
          const name = p.name.toLowerCase();
          const tags = p.tags.map((t) => t.toLowerCase());

          for (const kw of keywords) {
            if (name.includes(kw)) score += 3;
            if (tags.some((t) => t === kw)) score += 2;
            else if (tags.some((t) => t.includes(kw) || kw.includes(t)))
              score += 1;
          }

          if (p.image_tags) {
            const allScreenshotTags = new Set(
              Object.values(p.image_tags).flat().map((t) => t.toLowerCase())
            );
            for (const kw of keywords) {
              if ([...allScreenshotTags].some((t) => t === kw)) score += 2;
              else if ([...allScreenshotTags].some((t) => t.includes(kw) || kw.includes(t)))
                score += 1;
            }
          }

          // Structural-filter-only queries (no free-text) get a baseline
          // score so they aren't filtered out by the score>0 check.
          if (keywords.length === 0) score = 1;

          return { product: p, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      if (scored.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No results. Try different keywords or use list_tags to see available tags.",
            },
          ],
        };
      }

      const results = scored.map((s) => ({
        ...productSummary(s.product, index.base_url),
        relevance_score: s.score,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query: query || null,
                product_tags: product_tags || [],
                screenshot_tags: screenshot_tags || [],
                tag_match,
                count: results.length,
                products: results,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 5. list_tags
  server.tool(
    "list_tags",
    "List all available tags with counts. Supports both product-level and screenshot-level tags. Use this to discover what you can search for.",
    {
      platform: z
        .enum(["Web", "Mobile", "Email"])
        .optional()
        .describe("Filter tags to a specific platform"),
      level: z
        .enum(["product", "screenshot", "all"])
        .default("all")
        .describe("Tag level: 'product' for product tags, 'screenshot' for per-image tags, 'all' for both"),
    },
    async ({ platform, level }) => {
      const index = await fetchIndex();

      const includeProduct = level === "product" || level === "all";
      const includeScreenshot = level === "screenshot" || level === "all";

      if (!platform) {
        const result: Record<string, unknown> = {};

        if (includeProduct) {
          const tags = Object.entries(index.tags)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);
          result.product_tags = { total: tags.length, tags };
        }

        if (includeScreenshot) {
          const sTags = Object.entries(index.screenshot_tags || {})
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);
          result.screenshot_tags = { total: sTags.length, tags: sTags };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Compute tag counts for a specific platform
      const result: Record<string, unknown> = { platform };

      if (includeProduct) {
        const tagCounts: Record<string, number> = {};
        for (const product of index.products) {
          if (product.platform !== platform) continue;
          for (const tag of product.tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }
        const tags = Object.entries(tagCounts)
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count);
        result.product_tags = { total: tags.length, tags };
      }

      if (includeScreenshot) {
        const tagCounts: Record<string, number> = {};
        for (const product of index.products) {
          if (product.platform !== platform || !product.image_tags) continue;
          for (const tags of Object.values(product.image_tags)) {
            for (const tag of tags) {
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
          }
        }
        const tags = Object.entries(tagCounts)
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count);
        result.screenshot_tags = { total: tags.length, tags };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // 6. search_screenshots_by_tags
  server.tool(
    "search_screenshots_by_tags",
    "Search for individual screenshots by their screenshot-level tags (e.g. 'onboarding', 'empty state', 'checkout'). Returns specific matching images across all products. Use list_tags with level='screenshot' to see available screenshot tags.",
    {
      tags: z.array(z.string()).describe("Screenshot tags to search for"),
      match: z
        .enum(["all", "any"])
        .default("any")
        .describe("Match all tags or any tag"),
      platform: z
        .enum(["Web", "Mobile", "Email"])
        .optional()
        .describe("Filter by platform"),
      limit: z
        .number()
        .min(1)
        .max(50)
        .default(20)
        .describe("Max number of screenshot results to return"),
    },
    async ({ tags, match, platform, limit }) => {
      const index = await fetchIndex();
      const searchTags = tags.map((t) => t.toLowerCase());

      const matches: Array<{
        product_name: string;
        platform: string;
        image: string;
        download_url: string;
        screenshot_tags: string[];
        product_tags: string[];
        gallery_url: string;
      }> = [];

      for (const product of index.products) {
        if (platform && product.platform !== platform) continue;
        if (!product.image_tags) continue;

        for (const [filename, imgTags] of Object.entries(product.image_tags)) {
          const lowerImgTags = imgTags.map((t) => t.toLowerCase());
          let matched: boolean;

          if (match === "all") {
            matched = searchTags.every((st) =>
              lowerImgTags.some((it) => it.includes(st) || st.includes(it))
            );
          } else {
            matched = searchTags.some((st) =>
              lowerImgTags.some((it) => it.includes(st) || st.includes(it))
            );
          }

          if (matched) {
            const imagePath = product.images.find((img) => img.endsWith(`/${filename}`)) || `${product.path}/${filename}`;
            matches.push({
              product_name: product.name,
              platform: product.platform,
              image: filename,
              download_url: imageUrl(index.base_url, imagePath),
              screenshot_tags: imgTags,
              product_tags: product.tags,
              gallery_url: `${index.base_url}${product.gallery_url}`,
            });
          }
        }
      }

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No screenshots found matching tags: ${tags.join(", ")}. Use list_tags with level='screenshot' to see available screenshot tags.`,
            },
          ],
        };
      }

      const results = matches.slice(0, limit);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { query_tags: tags, match, count: results.length, total: matches.length, screenshots: results },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 7. get_random_inspiration
  server.tool(
    "get_random_inspiration",
    "Get random products for creative exploration. Returns metadata only — use get_product_screenshots to see images for specific products.",
    {
      count: z
        .number()
        .min(1)
        .max(10)
        .default(5)
        .describe("Number of random products"),
      platform: z
        .enum(["Web", "Mobile", "Email"])
        .optional()
        .describe("Filter by platform"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional tags to filter by before randomizing"),
    },
    async ({ count, platform, tags }) => {
      const index = await fetchIndex();

      let pool = index.products;
      if (platform) {
        pool = pool.filter((p) => p.platform === platform);
      }
      if (tags && tags.length > 0) {
        const searchTags = tags.map((t) => t.toLowerCase());
        pool = pool.filter((p) =>
          p.tags.some((pt) =>
            searchTags.some(
              (st) => pt.toLowerCase().includes(st) || st.includes(pt.toLowerCase())
            )
          )
        );
      }

      // Fisher-Yates shuffle and take first `count`
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const selected = shuffled.slice(0, count);
      const results = selected.map((p) => productSummary(p, index.base_url));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: results.length, products: results },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

async function fetchProductImages(
  product: Product,
  baseUrl: string,
  limit: number,
  includeImages: boolean
) {
  const imagesToFetch = product.images.slice(0, limit);

  // Structured per-image metadata that callers can parse deterministically
  // without having to reconstruct URLs or walk the base64 image blocks.
  const screenshotEntries = imagesToFetch.map((img) => {
    const filename = img.split("/").pop() || "";
    const tags =
      (product.image_tags && product.image_tags[filename]) || [];
    return {
      filename,
      download_url: imageUrl(baseUrl, img),
      tags,
    };
  });

  const summary = productSummary(product, baseUrl);
  const metadata = {
    ...summary,
    returned_count: screenshotEntries.length,
    screenshots: screenshotEntries,
  };

  const content: Array<
    { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
  > = [
    { type: "text" as const, text: JSON.stringify(metadata, null, 2) },
  ];

  if (!includeImages) {
    return { content };
  }

  const imageResults = await Promise.all(
    screenshotEntries.map(async (entry) => {
      const result = await fetchImageAsBase64(entry.download_url);
      return { entry, result };
    })
  );

  let anyFetched = false;
  for (const { entry, result } of imageResults) {
    if (!result) continue;
    anyFetched = true;
    if (entry.tags.length > 0) {
      content.push({
        type: "text" as const,
        text: `[${entry.filename}] tags: ${entry.tags.join(", ")}`,
      });
    }
    content.push({
      type: "image" as const,
      data: result.data,
      mimeType: result.mimeType,
    });
  }

  if (!anyFetched) {
    content.push({
      type: "text" as const,
      text: "Could not fetch any images. Download URLs are included in the metadata above — try fetching them directly, or call again with include_images=false.",
    });
  }

  return { content };
}
