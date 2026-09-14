export interface Product {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
}

const API_BASE = "/api";

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products`);
  const data = await res.json();
  return data.products;
}
