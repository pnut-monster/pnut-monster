import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import {
  orderConfirmationEmailData,
  paymentSuccessfulEmailData,
} from "@/lib/email/templates";

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
      String(payment.status) !== "captured"
    ) {
      return NextResponse.json(
        { error: "Payment could not be verified with Razorpay" },
        { status: 400 }
      );
    }

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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: attempt, error: attemptError } = await admin
      .from("payment_attempts" as never)
      .select("id, amount_paise, order_payload, items_payload, wallet_amount, nth_order_discount")
      .eq("razorpay_order_id", razorpay_order_id)
      .eq("user_id", user.id)
      .single();
    const savedAttempt = attempt as {
      id: string;
      amount_paise: number;
      order_payload: Record<string, unknown>;
      items_payload: unknown[];
      wallet_amount: number;
      nth_order_discount: number;
    } | null;

    if (attemptError || !savedAttempt || savedAttempt.amount_paise !== Number(payment.amount)) {
      return NextResponse.json({ error: "Payment attempt does not match" }, { status: 400 });
    }

    const { error: captureError } = await admin
      .from("payment_attempts" as never)
      .update({ status: "captured", razorpay_payment_id, updated_at: new Date().toISOString() } as never)
      .eq("id", savedAttempt.id);
    if (captureError) throw captureError;

    const { data, error } = await admin.rpc(
      "finalize_captured_payment_attempt" as never,
      { p_attempt_id: savedAttempt.id } as never
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
    if (user?.email) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      const customerName = (profile as { full_name: string | null } | null)?.full_name || "Customer";
      const savedOrderData = savedAttempt.order_payload;
      const savedOrderItems = savedAttempt.items_payload;
      const totalAmount = Number(savedOrderData.total ?? 0);

      // Order confirmation
      const orderEmailData = orderConfirmationEmailData(customerName, {
        orderNumber: result.order_id.slice(0, 8).toUpperCase(),
        items: (savedOrderItems as { name?: string; item_name?: string; quantity: number; unit_price: number }[]).map(
          (i) => ({
            name: i.name || i.item_name || "Item",
            quantity: i.quantity,
            price: i.unit_price,
          })
        ),
        subtotal: Number(savedOrderData.subtotal ?? totalAmount),
        deliveryFee: Number(savedOrderData.delivery_fee ?? 0),
        discount: Number(savedAttempt.wallet_amount || 0) + Number(savedAttempt.nth_order_discount || 0),
        total: totalAmount,
        paymentMethod: "Razorpay",
        outletName: String(savedOrderData.outlet_name || "PNUT Monster"),
        orderType: String(savedOrderData.order_type || "delivery"),
      });
      await sendTemplateEmail({
        template: "order-confirmation",
        to: user.email,
        data: orderEmailData,
        tags: { source: "checkout", order: result.order_id },
      }).catch((emailError) => console.error("Order confirmation email failed", emailError));

      // Payment receipt
      const receiptData = paymentSuccessfulEmailData(customerName, {
        amount: totalAmount,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        method: "Razorpay (Online)",
        date: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      });
      await sendTemplateEmail({
        template: "payment-successful",
        to: user.email,
        data: receiptData,
        tags: { source: "checkout", payment: razorpay_payment_id },
      }).catch((emailError) => console.error("Payment receipt email failed", emailError));
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
