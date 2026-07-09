import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, walletTopupEmail } from "@/lib/email";

const razorpay = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: NextRequest) {
  try {
    const { action, amount, razorpay_order_id, razorpay_payment_id, razorpay_signature, accessToken } =
      await req.json();

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create order
    if (action === "create-order") {
      if (!amount || amount < 1) {
        return NextResponse.json({ error: "Minimum top-up is ₹1" }, { status: 400 });
      }

      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100),
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

      if (expectedSignature !== razorpay_signature) {
        return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
      }

      // Use user's token to call the RPC (so auth.uid() is set)
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        }
      );

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const topupAmount = amount || (await getOrderAmount(razorpay_order_id));

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
        const template = walletTopupEmail(name, {
          amount: topupAmount,
          paymentId: razorpay_payment_id,
          newBalance: result?.total_balance ?? topupAmount,
        });
        sendEmail({ to: user.email, ...template }).catch(() => {});
      }

      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Wallet topup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function getOrderAmount(orderId: string): Promise<number> {
  try {
    const order = await razorpay.orders.fetch(orderId);
    return Number(order.amount) / 100;
  } catch {
    return 0;
  }
}
