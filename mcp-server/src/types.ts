// The platform taxonomy. Mirrors `platforms:` in the site's _config.yml — the
// site derives it from its top-level content directories, and this server only
// ever reads the generated api/products.json, so the two must be kept in step
// by hand. PLATFORMS in tools.ts is the single place the values are listed.
export const PLATFORMS = ["Web", "iOS", "Android", "Email"] as const;

export type Platform = (typeof PLATFORMS)[number];

export interface Product {
  name: string;
  platform: Platform;
  path: string;
  tags: string[];
  image_tags?: Record<string, string[]>;
  // Form-factor flags mirrored from gallery frontmatter: filenames captured on
  // a tablet (iPad, in iOS galleries) or an unfolded foldable (Android). Absent
  // when the product has none. Used by the `form_factor` filter.
  tablet_images?: string[];
  foldable_images?: string[];
  images: string[];
  image_count: number;
  gallery_url: string;
}

export interface ProductsIndex {
  generated_at: string;
  base_url: string;
  products: Product[];
  tags: Record<string, number>;
  screenshot_tags: Record<string, number>;
}
