export interface Product {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
}

export interface CheckoutSuccess {
  orderId: string;
  status: "pending";
  statusUrl: string;
}

export interface ApiError {
  error: { code: string; message: string; field?: string };
}

export type CheckoutResponse = CheckoutSuccess | ApiError;

export interface OrderStatus {
  orderId: string;
  status: "pending" | "confirmed" | "failed";
  error?: { code: string; message: string };
}

const API_BASE = "/api";

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products`);
  const data = await res.json();
  return data.products;
}

export async function postCheckout(input: {
  productId: string;
  quantity: number;
  idempotencyKey: string;
}): Promise<{ statusCode: number; body: CheckoutResponse }> {
  const res = await fetch(`${API_BASE}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.json();
  return { statusCode: res.status, body };
}

export async function fetchOrderStatus(orderId: string): Promise<OrderStatus> {
  const res = await fetch(`${API_BASE}/orders/${orderId}`);
  return res.json();
}
