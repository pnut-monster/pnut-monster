"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Check,
  Clock,
  MapPin,
} from "lucide-react";
import { Button, Card, Badge, Spinner } from "@/components/ui";
import { DeliveryCode } from "@/components/restaurant/delivery-code";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/utils/helpers";
import { ORDER_STATUS_LABELS } from "@/lib/utils/constants";
import type { Order, OrderItem, Outlet } from "@/lib/supabase/types";
import toast from "react-hot-toast";

type OrderDetailRow = Order & {
  order_items: OrderItem[] | null;
  outlets: Pick<Outlet, "name" | "address"> | null;
};
type OrderStatus = Order["status"];

const orderDetailCache = new Map<
  string,
  {
    order: Order;
    orderItems: OrderItem[];
    outlet: Pick<Outlet, "name" | "address"> | null;
  }
>();

const STATUS_STEPS: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "picked_up",
];

const STATUS_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  pending: "warning",
  confirmed: "info",
  preparing: "warning",
  ready: "success",
  picked_up: "default",
  cancelled: "danger",
  rejected: "danger",
};

export default function OrderTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [outlet, setOutlet] = useState<Pick<Outlet, "name" | "address"> | null>(null);
  const [loading, setLoading] = useState(true);
  const orderStatusRef = useRef<OrderStatus | null>(null);

  const fetchOrder = useCallback(async () => {
    const cached = orderDetailCache.get(orderId);
    if (cached) {
      setOrder(cached.order);
      orderStatusRef.current = cached.order.status;
      setOrderItems(cached.orderItems);
      setOutlet(cached.outlet);
      setLoading(false);
    }

    try {
      const supabase = createClient();

      const { data: orderData } = await supabase
        .from("orders")
        .select("*, order_items(*), outlets(name, address)")
        .eq("id", orderId)
        .single();

      const fetchedOrderRow = orderData as OrderDetailRow | null;

      if (fetchedOrderRow) {
        const { order_items, outlets, ...fetchedOrder } = fetchedOrderRow;
        const fetchedItems = order_items ?? [];
        const fetchedOutlet = outlets ?? null;

        orderDetailCache.set(orderId, {
          order: fetchedOrder,
          orderItems: fetchedItems,
          outlet: fetchedOutlet,
        });

        setOrder(fetchedOrder);
        orderStatusRef.current = fetchedOrder.status;
        setOrderItems(fetchedItems);
        setOutlet(fetchedOutlet);
      }
    } catch (err) {
      console.error("Failed to fetch order:", err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Initial fetch
  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
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
      <div className="min-h-screen bg-brand-cream">
        <div className="sticky top-0 z-10 bg-white border-b border-brand-gray-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1 -ml-1 rounded-lg hover:bg-brand-gray-100 transition-colors"
            >
              <ChevronLeft className="h-6 w-6 text-brand-black" />
            </button>
            <h1 className="text-xl font-bold font-[family-name:var(--font-heading)] text-brand-black">
              Order Details
            </h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-20 px-4 text-center">
          <p className="text-brand-gray-500">Order not found</p>
        </div>
      </div>
    );
  }

  const currentStepIndex = STATUS_STEPS.indexOf(order.status);
  const isCancelled = order.status === "cancelled";
  const isRejected = order.status === "rejected";

  return (
    <div className="min-h-screen bg-brand-cream pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-brand-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 rounded-lg hover:bg-brand-gray-100 transition-colors"
          >
            <ChevronLeft className="h-6 w-6 text-brand-black" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold font-[family-name:var(--font-heading)] text-brand-black">
              Order #{order.order_number}
            </h1>
          </div>
          <Badge variant={STATUS_BADGE_VARIANT[order.status] ?? "default"}>
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Picked Up — Success Screen */}
        {order.status === "picked_up" && (
          <Card className="py-8">
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-brand-green flex items-center justify-center mb-5">
                <Check className="h-12 w-12 text-white" strokeWidth={3} />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold font-[family-name:var(--font-heading)] text-brand-black mb-1">
                  Order Picked Up!
                </h2>
                <p className="text-sm text-brand-gray-500">
                  Enjoy your meal from PNUT MONSTER
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Timeline / Stepper */}
        {!isCancelled && !isRejected && order.status !== "picked_up" ? (
          <Card>
            <h3 className="font-semibold text-brand-black text-sm mb-4">
              Order Progress
            </h3>
            <div className="relative">
              {STATUS_STEPS.map((step, index) => {
                const isCompleted = index < currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const isUpcoming = index > currentStepIndex;

                return (
                  <div key={step} className="flex gap-3 pb-6 last:pb-0">
                    {/* Line + Circle */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isCompleted
                            ? "bg-brand-green"
                            : isCurrent
                            ? "bg-brand-yellow"
                            : "bg-brand-gray-200"
                        }`}
                      >
                        {isCompleted ? (
                          <Check className="h-4 w-4 text-white" strokeWidth={3} />
                        ) : isCurrent ? (
                          <Clock className="h-4 w-4 text-brand-black" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-brand-gray-400" />
                        )}
                      </div>
                      {index < STATUS_STEPS.length - 1 && (
                        <div
                          className={`w-0.5 flex-1 min-h-[24px] ${
                            isCompleted
                              ? "bg-brand-green"
                              : "bg-brand-gray-200"
                          }`}
                        />
                      )}
                    </div>

                    {/* Label + Time */}
                    <div className="pt-1">
                      <p
                        className={`text-sm font-semibold ${
                          isUpcoming
                            ? "text-brand-gray-400"
                            : "text-brand-black"
                        }`}
                      >
                        {ORDER_STATUS_LABELS[step] ?? step}
                      </p>
                      {isCurrent && (
                        <p className="text-xs text-brand-gray-500 mt-0.5">
                          {formatDateTime(order.updated_at)}
                        </p>
                      )}
                      {isCompleted && index === 0 && (
                        <p className="text-xs text-brand-gray-500 mt-0.5">
                          {formatDateTime(order.created_at)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : isCancelled ? (
          <Card className="border-l-4 border-brand-red">
            <p className="text-sm font-semibold text-brand-red">
              This order was cancelled
            </p>
            <p className="text-xs text-brand-gray-500 mt-1">
              {formatDateTime(order.updated_at)}
            </p>
          </Card>
        ) : isRejected ? (
          <Card className="border-l-4 border-red-700">
            <p className="text-sm font-semibold text-red-700">
              This order was rejected by the outlet
            </p>
            <p className="text-xs text-brand-gray-500 mt-1">
              {formatDateTime(order.updated_at)}
            </p>
          </Card>
        ) : null}

        {/* Delivery Code — shown when order is ready for pickup */}
        {order.status === "ready" && (
          <Card className="border-2 border-brand-yellow bg-brand-yellow/5">
            <p className="text-center text-xs font-semibold text-brand-gray-500 mb-1">
              Show this code at the counter to collect your order
            </p>
            <DeliveryCode orderNumber={order.order_number} code={order.delivery_code} size="lg" />
          </Card>
        )}

        {/* Order Items */}
        <Card>
          <h3 className="font-semibold text-brand-black text-sm mb-3">
            Items
          </h3>
          <div className="space-y-2">
            {orderItems.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center text-sm"
              >
                <span className="text-brand-black flex-1">
                  {item.quantity}x {item.item_name}
                </span>
                <span className="font-semibold text-brand-black ml-2">
                  {formatCurrency(item.total_price)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Bill Summary */}
        <Card>
          <h3 className="font-semibold text-brand-black text-sm mb-3">
            Bill Summary
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-brand-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-brand-green-dark">
                <span>Discount</span>
                <span>-{formatCurrency(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-brand-gray-600">
              <span>Tax</span>
              <span>{formatCurrency(order.tax)}</span>
            </div>
            <div className="flex justify-between text-brand-gray-600">
              <span>Packaging</span>
              <span>{formatCurrency(order.packaging_charge)}</span>
            </div>
            {order.wallet_used > 0 && (
              <div className="flex justify-between text-brand-green-dark">
                <span>Wallet</span>
                <span>-{formatCurrency(order.wallet_used)}</span>
              </div>
            )}
            <div className="border-t border-brand-gray-200 pt-2 flex justify-between font-bold text-brand-black">
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
        </Card>

        {/* Outlet Info */}
        {outlet && (
          <Card>
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-brand-yellow-dark shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-brand-black text-sm">
                  {outlet.name}
                </h3>
                <p className="text-xs text-brand-gray-500 mt-0.5">
                  {outlet.address}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Back button */}
        <div className="pt-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push("/orders")}
          >
            View All Orders
          </Button>
        </div>
      </div>
    </div>
  );
}
