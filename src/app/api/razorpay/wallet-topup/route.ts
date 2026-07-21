import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";
import { sendTemplateEmail } from "@/lib/email";
import { walletTopupEmailData } from "@/lib/email/templates";
import { consumeRateLimit, requestIp } from "@/lib/security/rate-limit";

function createRazorpayClient() {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay credentials are not configured");
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

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

export async function POST(req: NextRequest) {
  try {
    const originError = assertSameOrigin(req);
    if (originError) return originError;

    const { action, amount, razorpay_order_id, razorpay_payment_id, razorpay_signature, accessToken } =
      await req.json();

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Create order
    if (action === "create-order") {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount < 1 || numericAmount > 100_000) {
        return NextResponse.json({ error: "Minimum top-up is ₹1" }, { status: 400 });
      }

      const order = await createRazorpayClient().orders.create({
        amount: Math.round(numericAmount * 100),
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
    if (action === "verify") {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
      }

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (!timingSafeEqualHex(expectedSignature, razorpay_signature)) {
        return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
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

      // Use user's token to call the RPC (so auth.uid() is set)
      const topupAmount = Number(payment.amount) / 100;

      const { data, error } = await supabase.rpc("self_topup_wallet" as never, {
        p_user_id: user.id,
        p_amount: topupAmount,
        p_razorpay_payment_id: razorpay_payment_id,
        p_razorpay_order_id: razorpay_order_id,
      } as never);

      if (error) {
        console.error("Wallet topup error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Send wallet top-up email (fire-and-forget)
      if (user.email) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        const name = (profile as { full_name: string | null } | null)?.full_name || "Customer";
        const result = data as { total_balance?: number } | null;
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
        }).catch((emailError) => console.error("Wallet top-up email failed", emailError));
      }

      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Wallet topup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
