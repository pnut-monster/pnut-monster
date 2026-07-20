import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/types";
import { sendEmail, orderConfirmationEmail, paymentReceiptEmail } from "@/lib/email";

function createRazorpayClient() {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay credentials are not configured");
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const verifyRateLimit = new Map<string, { count: number; resetAt: number }>();

function timingSafeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
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

function checkRateLimit(key: string) {
  const now = Date.now();
  const current = verifyRateLimit.get(key);
  if (!current || current.resetAt <= now) {
    verifyRateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
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
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderData,
      orderItems,
      walletAmount,
      loyaltyPoints,
      nthOrderDiscount,
      accessToken,
    } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing payment details" },
        { status: 400 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (!timingSafeEqualHex(expectedSignature, razorpay_signature)) {
      return NextResponse.json(
        { error: "Payment verification failed" },
        { status: 400 }
      );
    }

    const razorpay = createRazorpayClient();
    const [payment, order] = await Promise.all([
      razorpay.payments.fetch(razorpay_payment_id),
      razorpay.orders.fetch(razorpay_order_id),
    ]);

    if (
      payment.order_id !== razorpay_order_id ||
      Number(payment.amount) !== Number(order.amount) ||
      payment.currency !== order.currency ||
      !["captured", "authorized"].includes(String(payment.status))
    ) {
      return NextResponse.json(
        { error: "Payment could not be verified with Razorpay" },
        { status: 400 }
      );
    }

    const paidAmount = Number(payment.amount) / 100;

    // Use the user's access token so auth.uid() is set in the RPC
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    const finalOrderData: Json = {
      ...orderData,
      payment_status: "paid",
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_amount_paid: paidAmount,
    };

    const { data, error } = await supabase.rpc(
      "place_order_with_wallet" as never,
      {
        p_order: finalOrderData,
        p_items: orderItems as Json[],
        p_wallet_amount: walletAmount || 0,
        p_loyalty_points: loyaltyPoints || 0,
        p_nth_order_discount: nthOrderDiscount || 0,
      } as never
    );

    const result = data as { order_id: string } | null;

    if (error) {
      console.error("Order placement error after payment:", error);
      return NextResponse.json(
        { error: error.message || "Failed to place order after payment" },
        { status: 500 }
      );
    }

    if (!result || !result.order_id) {
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    // Send emails (fire-and-forget)
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      const customerName = (profile as { full_name: string | null } | null)?.full_name || "Customer";
      const totalAmount = orderData.total_amount || 0;

      // Order confirmation
      const orderTemplate = orderConfirmationEmail(customerName, {
        orderNumber: result.order_id.slice(0, 8).toUpperCase(),
        items: (orderItems as { name: string; quantity: number; unit_price: number }[]).map(
          (i: { name: string; quantity: number; unit_price: number }) => ({
            name: i.name,
            quantity: i.quantity,
            price: i.unit_price,
          })
        ),
        subtotal: orderData.subtotal || totalAmount,
        deliveryFee: orderData.delivery_fee || 0,
        discount: (walletAmount || 0) + (nthOrderDiscount || 0),
        total: totalAmount,
        paymentMethod: "Razorpay",
        outletName: orderData.outlet_name || "PNUT Monster",
        orderType: orderData.order_type || "delivery",
      });
      sendEmail({ to: user.email, ...orderTemplate }).catch(() => {});

      // Payment receipt
      const receiptTemplate = paymentReceiptEmail(customerName, {
        amount: totalAmount,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        method: "Razorpay (Online)",
        date: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      });
      sendEmail({ to: user.email, ...receiptTemplate }).catch(() => {});
    }

    return NextResponse.json({ order_id: result.order_id });
  } catch (error) {
    console.error("Payment verification error:", error);
    return NextResponse.json(
      { error: "Payment verification failed" },
      { status: 500 }
    );
  }
}
