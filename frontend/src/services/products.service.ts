import { API_BASE } from "./http";

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
  imageUrl: string;
  imageAlt: string;
}

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products`);
  const data = await res.json();
  return data.products;
}
