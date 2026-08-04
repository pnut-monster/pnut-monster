import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import {
  orderConfirmationEmailData,
  paymentSuccessfulEmailData,
} from "@/lib/email/templates";
import { consumeRateLimit, requestIp } from "@/lib/security/rate-limit";
import { z } from "zod";
import { createApiLogger } from "@/lib/logger/api";
import { razorpay } from "@/lib/razorpay";

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

const requestSchema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
  accessToken: z.string(),
});

export async function POST(req: NextRequest) {
  const { log, requestId } = createApiLogger(req);

  try {
    const originError = assertSameOrigin(req);
    if (originError) return originError;

    // Pre-launch ordering lock check
    const adminCheck = createAdminClient();
    const { data: launchSettings } = await adminCheck
      .from("app_settings")
      .select("key, value")
      .in("key", ["pre_launch_enabled", "pre_launch_date"]);

    if (launchSettings) {
      const enabledRow = launchSettings.find((r: { key: string }) => r.key === "pre_launch_enabled");
      const dateRow = launchSettings.find((r: { key: string }) => r.key === "pre_launch_date");
      if (enabledRow?.value === "true") {
        const launchDate = dateRow ? new Date(dateRow.value) : null;
        if (!launchDate || new Date() < launchDate) {
          return NextResponse.json(
            { error: "Ordering is not available yet. Please check back on launch day!" },
            { status: 403 }
          );
        }
      }
    }

    const body = await req.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Missing payment details" },
        { status: 400 }
      );
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      accessToken,
    } = validation.data;

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
    const rateLimit = await consumeRateLimit(
      "razorpay_verify_payment",
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

    const admin = createAdminClient();
    const { data: attempt, error: attemptError } = await admin
      .from("payment_attempts")
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
      .from("payment_attempts")
      .update({ status: "captured", razorpay_payment_id, updated_at: new Date().toISOString() })
      .eq("id", savedAttempt.id);
    if (captureError) throw captureError;

    const { data, error } = await admin.rpc(
      "finalize_captured_payment_attempt",
      { p_attempt_id: savedAttempt.id }
    );

    const result = data as { order_id: string } | null;

    if (error) {
      log.error("Order placement error after payment", {
        error: error.message || String(error),
        attemptId: savedAttempt.id,
      });
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
      }).catch((emailError) => log.warn("Order confirmation email failed", {
          error: emailError instanceof Error ? emailError.message : String(emailError),
        }));

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
      }).catch((emailError) => log.warn("Payment receipt email failed", {
          error: emailError instanceof Error ? emailError.message : String(emailError),
        }));
    }

    return NextResponse.json({ order_id: result.order_id });
  } catch (error) {
    log.error("Payment verification failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Payment verification failed" },
      { status: 500 }
    );
  }
}
