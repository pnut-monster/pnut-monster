const BASE_URL = "https://api.razorpay.com/v1";

function getAuth() {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay credentials are not configured");
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: getAuth(),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay API ${method} ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface RazorpayOrder {
  id: string;
  amount: number | string;
  currency: string;
  receipt?: string;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  amount: number | string;
  currency: string;
  status: string;
  order_id: string;
  method: string;
}

export const razorpay = {
  orders: {
    create(params: { amount: number; currency: string; receipt?: string }) {
      return request<RazorpayOrder>("POST", "/orders", params);
    },
    fetch(orderId: string) {
      return request<RazorpayOrder>("GET", `/orders/${orderId}`);
    },
  },
  payments: {
    fetch(paymentId: string) {
      return request<RazorpayPayment>("GET", `/payments/${paymentId}`);
    },
  },
};
