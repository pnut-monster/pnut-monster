import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function createRazorpayClient() {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay credentials are not configured");
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const createOrderRateLimit = new Map<string, { count: number; resetAt: number }>();

function isDevelopmentOrigin(origin: URL): boolean {
  if (process.env.NODE_ENV !== "development") return false;

  const host = origin.hostname;
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    (origin.protocol === "http:" && (origin.port === "3000" || origin.port === "3001") && isIpv4)
  );
}

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const allowedOrigins = new Set([request.nextUrl.origin]);
  if (host) allowedOrigins.add(`${proto}://${host}`);
  if (configuredOrigin) allowedOrigins.add(configuredOrigin.replace(/\/$/, ""));

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  if (host) {
    const requestHost = host.split(",")[0]?.trim();
    if (requestHost && parsedOrigin.host === requestHost) return null;
  }

  if (!allowedOrigins.has(parsedOrigin.origin) && !isDevelopmentOrigin(parsedOrigin)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  return null;
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const current = createOrderRateLimit.get(key);
  if (!current || current.resetAt <= now) {
    createOrderRateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return NextResponse.json({ error: "Too many payment attempts" }, { status: 429 });
  }

  current.count += 1;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const originError = assertSameOrigin(req);
    if (originError) return originError;

    const rateLimitError = checkRateLimit(
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "local"
    );
    if (rateLimitError) return rateLimitError;

    const {
      amount,
      currency = "INR",
      receipt,
      orderData,
      orderItems,
      walletAmount = 0,
      loyaltyPoints = 0,
      nthOrderDiscount = 0,
    } = await req.json();

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 100_000) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (currency !== "INR") {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    const supabase = await createClient("sb-customer-auth-token");
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!orderData || !Array.isArray(orderItems) || orderItems.length === 0) {
      return NextResponse.json({ error: "Missing order details" }, { status: 400 });
    }

    const order = await createRazorpayClient().orders.create({
      amount: Math.round(numericAmount * 100),
      currency,
      receipt: receipt || `order_${Date.now()}`,
    });

    const admin = createAdminClient();
    const { data: attempt, error: attemptError } = await admin
      .from("payment_attempts" as never)
      .insert({
        user_id: user.id,
        razorpay_order_id: order.id,
        amount_paise: Number(order.amount),
        currency: order.currency,
        order_payload: { ...orderData, user_id: user.id },
        items_payload: orderItems,
        wallet_amount: Number(walletAmount) || 0,
        loyalty_points: Number(loyaltyPoints) || 0,
        nth_order_discount: Number(nthOrderDiscount) || 0,
      } as never)
      .select("id")
      .single();

    if (attemptError || !attempt) {
      console.error("Payment attempt persistence failed", attemptError);
      return NextResponse.json({ error: "Could not persist payment attempt" }, { status: 500 });
    }

    return NextResponse.json({
      id: order.id,
      attemptId: (attempt as { id: string }).id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("Razorpay create order error:", error);
    return NextResponse.json(
      { error: "Failed to create payment order" },
      { status: 500 }
    );
  }
}
