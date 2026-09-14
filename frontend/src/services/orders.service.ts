import { API_BASE } from "./http";

export interface OrderStatus {
  orderId: string;
  status: "pending" | "confirmed" | "failed";
  error?: { code: string; message: string };
}

export async function fetchOrderStatus(orderId: string): Promise<OrderStatus> {
  const res = await fetch(`${API_BASE}/orders/${orderId}`);
  return res.json();
}
