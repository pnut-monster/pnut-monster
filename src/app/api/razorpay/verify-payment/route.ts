import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/types";
import { sendEmail, orderConfirmationEmail, paymentReceiptEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
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

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json(
        { error: "Payment verification failed" },
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

    const finalOrderData: Json = {
      ...orderData,
      payment_status: "paid",
      razorpay_order_id,
      razorpay_payment_id,
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
