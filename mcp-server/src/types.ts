export interface Product {
  name: string;
  platform: "Web" | "Mobile" | "Email";
  path: string;
  tags: string[];
  images: string[];
  image_count: number;
  gallery_url: string;
}

export interface ProductsIndex {
  generated_at: string;
  base_url: string;
  products: Product[];
  tags: Record<string, number>;
}
