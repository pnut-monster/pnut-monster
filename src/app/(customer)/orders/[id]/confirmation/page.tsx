"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, Clock, ShoppingBag, XCircle, CheckCircle } from "lucide-react";
import { Button, Card, Spinner } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/helpers";
import type { Order, OrderItem } from "@/lib/supabase/types";
import toast from "react-hot-toast";

type OrderConfirmationRow = Order & {
  order_items: OrderItem[] | null;
};

const orderConfirmationCache = new Map<
  string,
  { order: Order; orderItems: OrderItem[] }
>();

export default function OrderConfirmationPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const orderStatusRef = useRef<Order["status"] | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function fetchOrder() {
      const cached = orderConfirmationCache.get(orderId);
      if (cached) {
        setOrder(cached.order);
        orderStatusRef.current = cached.order.status;
        setOrderItems(cached.orderItems);
        setLoading(false);
      }

      const { data: orderData } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", orderId)
        .single();

      const fetchedOrderRow = orderData as OrderConfirmationRow | null;

      if (fetchedOrderRow) {
        const { order_items, ...fetchedOrder } = fetchedOrderRow;
        const fetchedItems = order_items ?? [];

        orderConfirmationCache.set(orderId, {
          order: fetchedOrder,
          orderItems: fetchedItems,
        });

        setOrder(fetchedOrder);
        orderStatusRef.current = fetchedOrder.status;
        setOrderItems(fetchedItems);
      }

      setLoading(false);
    }

    fetchOrder();

    const channel = supabase
      .channel(`order-confirmation-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (payload) => {
          const updated = payload.new as Order;
          const previousStatus = orderStatusRef.current;
          orderStatusRef.current = updated.status;
          setOrder(updated);
          if (updated.status === previousStatus) return;
          if (updated.status === "confirmed") toast.success("Your order was accepted!");
          if (updated.status === "preparing") toast.success("Your order is being prepared");
          if (updated.status === "ready") toast.success("Your order is ready for pickup!", { duration: 6000 });
          if (updated.status === "picked_up") toast.success("Order completed. Enjoy your meal!");
          if (updated.status === "cancelled") toast.error("Your order was cancelled", { duration: 6000 });
          if (updated.status === "rejected") toast.error("The outlet could not accept your order", { duration: 6000 });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
        <div className="text-center">
          <ShoppingBag className="h-16 w-16 text-brand-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-brand-black mb-2">
            Order not found
          </h2>
          <Button onClick={() => router.push("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  const isAccepted = order.status === "confirmed" || order.status === "preparing" || order.status === "ready" || order.status === "picked_up";
  const isRejected = order.status === "rejected";
  const isPending = order.status === "pending";
  const isPickedUp = order.status === "picked_up";

  return (
    <div className="min-h-screen bg-brand-cream pb-8">
      {/* Success Animation */}
      <div className="flex flex-col items-center pt-12 pb-6 px-4">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
            isRejected ? "bg-red-500" : isAccepted ? "bg-brand-green" : "bg-brand-green"
          }`}
        >
          {isRejected ? (
            <XCircle className="h-10 w-10 text-white" strokeWidth={2.5} />
          ) : (
            <Check className="h-10 w-10 text-white" strokeWidth={3} />
          )}
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)] text-brand-black mb-1">
            {isRejected ? "Order Rejected" : isPickedUp ? "Order Picked Up Successfully!" : isAccepted ? "Order Accepted!" : "Order Placed!"}
          </h1>
          <p className="text-brand-gray-600 text-sm">
            {isRejected
              ? "Your order was rejected by the outlet"
              : isPickedUp
              ? "Your order has been picked up successfully"
              : isAccepted
              ? "Your order has been accepted and is being processed"
              : "Waiting for outlet to accept your order"}
          </p>
        </div>
      </div>

      {/* Status Banner */}
      {!isPending && (
        <div className="px-4 mb-4 space-y-3">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
              isRejected
                ? "bg-red-50 border border-red-200"
                : "bg-green-50 border border-green-200"
            }`}
          >
            {isRejected ? (
              <XCircle className="w-5 h-5 text-red-600 shrink-0" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
            )}
            <p
              className={`text-sm font-semibold ${
                isRejected ? "text-red-700" : "text-green-700"
              }`}
            >
              {isRejected
                ? "Order Rejected — The outlet could not fulfill your order."
                : isPickedUp
                ? "Order Picked Up Successfully!"
                : "Order Accepted — Your order is being prepared!"}
            </p>
          </div>

          {isRejected && (
            <div
              className={`px-4 py-3 rounded-xl ${
                order.payment_status === "refunded"
                  ? "bg-green-50 border border-green-200"
                  : "bg-orange-50 border border-orange-200"
              }`}
            >
              {order.payment_status === "refunded" ? (
                <p className="text-sm font-semibold text-green-700">
                  Your refund of {formatCurrency(order.total)} has been processed.
                  {order.wallet_used > 0 && (
                    <span className="block text-xs font-normal text-green-600 mt-1">
                      {formatCurrency(order.wallet_used)} refunded to wallet
                      {order.total - order.wallet_used > 0 && (
                        <> &middot; {formatCurrency(order.total - order.wallet_used)} refunded via {order.payment_method === "split" ? "online" : order.payment_method}</>
                      )}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-sm font-semibold text-orange-700">
                  Your refund is being processed. The amount will be returned to your original payment method shortly.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="px-4 space-y-4">
        {/* Order Number */}
        <Card className="text-center">
          <p className="text-xs text-brand-gray-500 uppercase tracking-wide mb-1">
            Order Number
          </p>
          <p className="text-2xl font-bold font-[family-name:var(--font-heading)] text-brand-black">
            {order.order_number}
          </p>
          {isPending && (
            <div className="flex items-center justify-center gap-1.5 mt-3 text-brand-yellow-dark">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-semibold">
                Waiting for outlet to confirm
              </span>
            </div>
          )}
          {isAccepted && !isPickedUp && (
            <div className="flex items-center justify-center gap-1.5 mt-3 text-brand-green-dark">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-semibold">
                Estimated ready in 15-20 mins
              </span>
            </div>
          )}
        </Card>

        {/* Order Items */}
        <Card>
          <h3 className="font-semibold text-brand-black text-sm mb-3">
            Order Summary
          </h3>
          <div className="space-y-2">
            {orderItems.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center text-sm"
              >
                <div className="flex-1">
                  <span className="text-brand-black">
                    {item.quantity}x {item.item_name}
                  </span>
                </div>
                <span className="font-semibold text-brand-black ml-2">
                  {formatCurrency(item.total_price)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-brand-gray-200 mt-3 pt-3 flex justify-between font-bold text-brand-black">
            <span>Total</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <Button
            size="lg"
            className="w-full"
            onClick={() => router.push(`/orders/${orderId}`)}
          >
            Track Order
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full"
            onClick={() => router.push("/")}
          >
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
