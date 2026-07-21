import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit, requestIp } from "@/lib/security/rate-limit";
import type { Json } from "@/lib/supabase/types";

function createRazorpayClient() {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay credentials are not configured");
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

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

export async function POST(req: NextRequest) {
  try {
    const originError = assertSameOrigin(req);
    if (originError) return originError;

    const {
      currency = "INR",
      receipt,
      orderData,
      orderItems,
      walletAmount = 0,
      loyaltyPoints = 0,
      nthOrderDiscount = 0,
    } = await req.json();

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

    const rateLimit = await consumeRateLimit(
      "razorpay_create_order",
      `${user.id}:${requestIp(req)}`,
      20,
      60
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many payment attempts" },
        { status: 429, headers: { "Retry-After": String(rateLimit.retry_after) } }
      );
    }
    if (!orderData || !Array.isArray(orderItems) || orderItems.length === 0) {
      return NextResponse.json({ error: "Missing order details" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: quoteData, error: quoteError } = await admin.rpc(
      "create_checkout_quote",
      {
        p_user_id: user.id,
        p_order: orderData as Json,
        p_items: orderItems as Json,
        p_wallet_amount: Number(walletAmount) || 0,
        p_loyalty_points: Number(loyaltyPoints) || 0,
        p_nth_order_discount: Number(nthOrderDiscount) || 0,
      }
    );
    const quote = quoteData as unknown as {
      quote_id: string;
      amount_paise: number;
      currency: string;
      expires_at: string;
    } | null;
    if (quoteError || !quote) {
      console.error("Checkout quote failed", quoteError);
      return NextResponse.json(
        { error: quoteError?.message || "Could not calculate checkout total" },
        { status: 400 }
      );
    }

    const order = await createRazorpayClient().orders.create({
      amount: quote.amount_paise,
      currency: quote.currency,
      receipt: receipt || `order_${Date.now()}`,
    });

    const { data: attempt, error: attemptError } = await admin
      .from("payment_attempts")
      .insert({
        user_id: user.id,
        checkout_quote_id: quote.quote_id,
        razorpay_order_id: order.id,
        amount_paise: Number(order.amount),
        currency: order.currency,
        order_payload: { ...orderData, user_id: user.id },
        items_payload: orderItems,
        wallet_amount: Number(walletAmount) || 0,
        loyalty_points: Number(loyaltyPoints) || 0,
        nth_order_discount: Number(nthOrderDiscount) || 0,
      })
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
      expiresAt: quote.expires_at,
    });
  } catch (error) {
    console.error("Razorpay create order error:", error);
    return NextResponse.json(
      { error: "Failed to create payment order" },
      { status: 500 }
    );
  }
}
