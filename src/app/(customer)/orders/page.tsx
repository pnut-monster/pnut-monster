"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ShoppingBag,
  Clock,
  RotateCcw,
} from "lucide-react";
import { Button, Card, Badge, Tabs, EmptyState, Spinner } from "@/components/ui";
import { useCartStore } from "@/lib/stores/cart-store";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/utils/helpers";
import { ORDER_STATUS_LABELS } from "@/lib/utils/constants";
import type { Order, OrderItem } from "@/lib/supabase/types";
import toast from "react-hot-toast";

type OrderWithItemCount = Order & { item_count: number; outlet_name: string };
type OrderListRow = Order & {
  order_items: { id: string }[] | null;
  outlets: { name: string } | null;
};

const ordersPageCache = new Map<string, OrderWithItemCount[]>();

const ACTIVE_STATUSES: Order["status"][] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
];

const PAST_STATUSES: Order["status"][] = ["picked_up", "cancelled", "rejected"];

const STATUS_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  pending: "warning",
  confirmed: "info",
  preparing: "warning",
  ready: "success",
  picked_up: "default",
  cancelled: "danger",
  rejected: "danger",
};

export default function OrderHistoryPage() {
  const router = useRouter();
  const { addItem, setOutlet } = useCartStore();

  const [activeTab, setActiveTab] = useState("active");
  const [orders, setOrders] = useState<OrderWithItemCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchOrders() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      const cached = ordersPageCache.get(user.id);
      if (cached) {
        setOrders(cached);
        setLoading(false);
      }

      try {
        const { data: ordersData } = await supabase
          .from("orders")
          .select("*, order_items(id), outlets(name)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (cancelled) return;

        const fetchedOrders = (ordersData as OrderListRow[] | null) ?? [];
        const enrichedOrders: OrderWithItemCount[] = fetchedOrders.map(
          ({ order_items, outlets, ...order }) => ({
            ...order,
            item_count: order_items?.length ?? 0,
            outlet_name: outlets?.name ?? "Unknown Outlet",
          })
        );

        ordersPageCache.set(user.id, enrichedOrders);
        setOrders(enrichedOrders);
      } catch (err) {
        console.error("Failed to fetch orders:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchOrders();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeOrders = useMemo(
    () => orders.filter((o) => ACTIVE_STATUSES.includes(o.status)),
    [orders]
  );
  const pastOrders = useMemo(
    () => orders.filter((o) => PAST_STATUSES.includes(o.status)),
    [orders]
  );
  const displayedOrders = activeTab === "active" ? activeOrders : pastOrders;

  useEffect(() => {
    displayedOrders.slice(0, 5).forEach((order) => {
      router.prefetch(`/orders/${order.id}`);
    });
  }, [displayedOrders, router]);

  const handleReorder = async (order: OrderWithItemCount) => {
    setReorderingId(order.id);

    try {
      const supabase = createClient();

      const { data: itemsData } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", order.id);

      const items = (itemsData as OrderItem[] | null) ?? [];

      if (items.length === 0) {
        toast.error("No items found for this order");
        setReorderingId(null);
        return;
      }

      // Set outlet for cart
      setOutlet(order.outlet_id);

      // Add each item to cart (simplified - without customizations)
      items.forEach((item) => {
        addItem({
          item_id: item.item_id,
          name: item.item_name,
          image_url: null,
          base_price: item.unit_price,
          quantity: item.quantity,
          customizations: [],
          total_price: item.unit_price * item.quantity,
        });
      });

      toast.success("Items added to cart!");
      router.push("/cart");
    } catch {
      toast.error("Failed to reorder. Please try again.");
    } finally {
      setReorderingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFBFC] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFBFC] pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-brand-gray-200 shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1 -ml-1 rounded-lg hover:bg-brand-gray-100 transition-colors"
            >
              <ChevronLeft className="h-6 w-6 text-brand-black" />
            </button>
            <div>
              <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider">ORDERS</p>
              <h1 className="text-lg font-bold font-[family-name:var(--font-heading)] text-brand-black">
                My Orders
              </h1>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          tabs={[
            { label: "Active", value: "active" },
            { label: "Past", value: "past" },
          ]}
          value={activeTab}
          onChange={setActiveTab}
          className="px-4 border-b border-brand-gray-100"
        />
      </div>

      <div className="px-4 py-4 space-y-3">
        {displayedOrders.length === 0 ? (
          <EmptyState
            icon={
              activeTab === "active" ? (
                <Clock className="h-16 w-16" />
              ) : (
                <ShoppingBag className="h-16 w-16" />
              )
            }
            title={
              activeTab === "active"
                ? "No active orders"
                : "No past orders"
            }
            description={
              activeTab === "active"
                ? "You don't have any active orders right now."
                : "You haven't placed any orders yet. Start exploring our menu!"
            }
            action={
              activeTab === "past" ? (
                <Button onClick={() => router.push("/menu")}>
                  Browse Menu
                </Button>
              ) : undefined
            }
          />
        ) : (
          displayedOrders.map((order) => (
            <Card
              key={order.id}
              className="cursor-pointer active:scale-[0.98] transition-transform"
              onClick={() => router.push(`/orders/${order.id}`)}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider">ORDER</p>
                  <p className="font-bold font-[family-name:var(--font-heading)] text-brand-black text-base">
                    #{order.order_number}
                  </p>
                  <p className="text-xs text-brand-gray-500 mt-0.5">
                    {formatDateTime(order.created_at)}
                  </p>
                </div>
                <Badge
                  variant={STATUS_BADGE_VARIANT[order.status] ?? "default"}
                >
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="text-brand-gray-600">
                  <span>{order.item_count} {order.item_count === 1 ? "item" : "items"}</span>
                  <span className="mx-1.5">&middot;</span>
                  <span>{order.outlet_name}</span>
                </div>
                <span className="font-bold text-brand-black">
                  {formatCurrency(order.total)}
                </span>
              </div>

              {/* Refund status for rejected orders */}
              {order.status === "rejected" && (
                <div className="mt-3 pt-3 border-t border-brand-gray-100">
                  {order.payment_status === "refunded" ? (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                      <span className="font-semibold">Refunded {formatCurrency(order.total)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-orange-700 bg-orange-50 rounded-lg px-3 py-2">
                      <span className="font-semibold">Refund in process</span>
                    </div>
                  )}
                </div>
              )}

              {/* Reorder button for past orders */}
              {PAST_STATUSES.includes(order.status) &&
                order.status !== "cancelled" &&
                order.status !== "rejected" && (
                  <div className="mt-3 pt-3 border-t border-brand-gray-100">
                    <Button
                      size="sm"
                      variant="outline"
                      loading={reorderingId === order.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReorder(order);
                      }}
                      className="w-full"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reorder
                    </Button>
                  </div>
                )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
