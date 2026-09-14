import { API_BASE } from "./http";

export interface CheckoutSuccess {
  orderId: string;
  status: "pending";
  statusUrl: string;
}

export interface ApiError {
  error: { code: string; message: string; field?: string };
}

export type CheckoutResponse = CheckoutSuccess | ApiError;

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
