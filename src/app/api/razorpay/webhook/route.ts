import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function validSignature(body: string, signature: string, secret: string) {
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(signature, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !validSignature(body, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(body) as {
    event?: string;
    payload?: { payment?: { entity?: {
      id?: string;
      order_id?: string;
      amount?: number;
      currency?: string;
      status?: string;
      error_description?: string;
    } } };
  };
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id || !payment.id) {
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("payment_attempts")
    .select("id, amount_paise, currency, status")
    .eq("razorpay_order_id", payment.order_id)
    .maybeSingle();
  const saved = attempt as {
    id: string;
    amount_paise: number;
    currency: string;
    status: string;
  } | null;

  // Unknown provider orders are acknowledged but never mutate application data.
  if (!saved) return NextResponse.json({ received: true });

  if (event.event === "payment.failed") {
    await admin
      .from("payment_attempts")
      .update({
        status: "failed",
        failure_reason: payment.error_description || "Razorpay payment failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", saved.id)
      .neq("status", "completed");
    return NextResponse.json({ received: true });
  }

  if (event.event !== "payment.captured" || payment.status !== "captured") {
    return NextResponse.json({ received: true });
  }
  if (Number(payment.amount) !== saved.amount_paise || payment.currency !== saved.currency) {
    return NextResponse.json({ error: "Payment amount mismatch" }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("payment_attempts")
    .update({
      status: saved.status === "completed" ? "completed" : "captured",
      razorpay_payment_id: payment.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", saved.id);
  if (updateError) throw updateError;

  const { error: finalizeError } = await admin.rpc(
    "finalize_captured_payment_attempt",
    { p_attempt_id: saved.id }
  );
  if (finalizeError) {
    console.error("Webhook payment finalization failed", finalizeError);
    return NextResponse.json({ error: "Finalization failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
