import { Product, ProductsIndex } from "./types.js";

const DEFAULT_BASE_URL =
  "https://screenshots.designknowledgebase.com";
const INDEX_PATH = "/api/products.json";

let cachedIndex: ProductsIndex | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getBaseUrl(): string {
  return process.env.SCREENSHOTS_BASE_URL || DEFAULT_BASE_URL;
}

export async function fetchIndex(): Promise<ProductsIndex> {
  const now = Date.now();
  if (cachedIndex && now - cachedAt < CACHE_TTL_MS) {
    return cachedIndex;
  }

  const url = `${getBaseUrl()}${INDEX_PATH}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch products index: ${res.status} ${res.statusText} from ${url}`);
  }

  cachedIndex = (await res.json()) as ProductsIndex;
  cachedAt = now;
  return cachedIndex;
}

export function buildTagIndex(products: Product[]): Map<string, Product[]> {
  const tagIndex = new Map<string, Product[]>();
  for (const product of products) {
    for (const tag of product.tags) {
      const key = tag.toLowerCase();
      if (!tagIndex.has(key)) {
        tagIndex.set(key, []);
      }
      tagIndex.get(key)!.push(product);
    }
  }
  return tagIndex;
}

export interface ScreenshotMatch {
  product: Product;
  image: string;
  tags: string[];
}

export function buildScreenshotTagIndex(
  products: Product[]
): Map<string, ScreenshotMatch[]> {
  const index = new Map<string, ScreenshotMatch[]>();
  for (const product of products) {
    if (!product.image_tags) continue;
    for (const [filename, tags] of Object.entries(product.image_tags)) {
      const imagePath = product.images.find((img) => img.endsWith(`/${filename}`)) || `${product.path}/${filename}`;
      for (const tag of tags) {
        const key = tag.toLowerCase();
        if (!index.has(key)) {
          index.set(key, []);
        }
        index.get(key)!.push({ product, image: imagePath, tags });
      }
    }
  }
  return index;
}

export function imageUrl(baseUrl: string, imagePath: string): string {
  // Image paths may contain spaces and special chars — encode each segment
  const encoded = imagePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${baseUrl}/${encoded}`;
}

export async function fetchImageAsBase64(
  url: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/png";
    const buffer = await res.arrayBuffer();
    const data = Buffer.from(buffer).toString("base64");

    return { data, mimeType: contentType };
  } catch {
    return null;
  }
}

export function productSummary(product: Product, baseUrl: string) {
  const summary: Record<string, unknown> = {
    name: product.name,
    platform: product.platform,
    tags: product.tags,
    image_count: product.image_count,
    gallery_url: `${baseUrl}${product.gallery_url}`,
  };
  if (product.image_tags && Object.keys(product.image_tags).length > 0) {
    summary.image_tags = product.image_tags;
  }
  return summary;
}
