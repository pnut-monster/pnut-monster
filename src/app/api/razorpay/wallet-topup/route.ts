import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import { walletTopupEmailData } from "@/lib/email/templates";
import { consumeRateLimit, requestIp } from "@/lib/security/rate-limit";
import { createApiLogger } from "@/lib/logger/api";
import { z } from "zod";
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

const createOrderSchema = z.object({
  action: z.literal("create-order"),
  accessToken: z.string(),
  amount: z.number().min(1).max(100000),
});

const verifyPaymentSchema = z.object({
  action: z.literal("verify"),
  accessToken: z.string(),
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

const requestSchema = z.discriminatedUnion("action", [
  createOrderSchema,
  verifyPaymentSchema,
]);

export async function POST(req: NextRequest) {
  const { log, requestId } = createApiLogger(req);

  try {
    const originError = assertSameOrigin(req);
    if (originError) return originError;

    const body = await req.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
    }

    const data = validation.data;
    const { accessToken } = data;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rateLimit = await consumeRateLimit(
      "razorpay_wallet_topup",
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

    // Pre-launch ordering & wallet top-up lock check
    try {
      const adminCheck = createAdminClient();
      const { data: launchSettings } = await adminCheck
        .from("app_settings")
        .select("key, value")
        .in("key", ["pre_launch_enabled", "pre_launch_date"]);

      if (launchSettings && launchSettings.length > 0) {
        const enabledRow = launchSettings.find((r: { key: string }) => r.key === "pre_launch_enabled");
        const dateRow = launchSettings.find((r: { key: string }) => r.key === "pre_launch_date");
        if (enabledRow?.value === "true") {
          const launchDate = dateRow ? new Date(dateRow.value) : null;
          if (!launchDate || new Date() < launchDate) {
            return NextResponse.json(
              { error: "Wallet top-up is not available before official launch!" },
              { status: 403 }
            );
          }
        }
      }
    } catch {
      // Continue if launch settings fail to load in isolated test environments
    }

    // Create order
    if (data.action === "create-order") {
      const order = await razorpay.orders.create({
        amount: Math.round(data.amount * 100),
        currency: "INR",
        receipt: `wallet_${Date.now()}`,
      });

      return NextResponse.json({
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      });
    }

    // Verify payment and credit wallet
    if (data.action === "verify") {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = data;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (!timingSafeEqualHex(expectedSignature, razorpay_signature)) {
        return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
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

      // Use user's token to call the RPC (so auth.uid() is set)
      const topupAmount = Number(payment.amount) / 100;

      const { data: rpcData, error: rpcError } = await supabase.rpc("self_topup_wallet" as never, {
        p_user_id: user.id,
        p_amount: topupAmount,
        p_razorpay_payment_id: razorpay_payment_id,
        p_razorpay_order_id: razorpay_order_id,
      } as never);

      if (rpcError) {
        log.error("Wallet topup failed", {
          error: rpcError.message,
          userId: user.id,
          amount: topupAmount,
          paymentId: razorpay_payment_id,
        });
        return NextResponse.json({ error: rpcError.message }, { status: 500 });
      }

      // Send wallet top-up email (fire-and-forget)
      if (user.email) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        const name = (profile as { full_name: string | null } | null)?.full_name || "Customer";
        const result = rpcData as { total_balance?: number } | null;
        const templateData = walletTopupEmailData(name, {
          amount: topupAmount,
          paymentId: razorpay_payment_id,
          newBalance: result?.total_balance ?? topupAmount,
        });
        await sendTemplateEmail({
          template: "wallet-topup",
          to: user.email,
          data: templateData,
          tags: { source: "wallet_topup", payment: razorpay_payment_id },
        }).catch((emailError) => log.warn("Wallet top-up email failed", {
          error: emailError instanceof Error ? emailError.message : String(emailError),
        }));
      }

      return NextResponse.json(rpcData);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    log.error("Wallet topup request failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
