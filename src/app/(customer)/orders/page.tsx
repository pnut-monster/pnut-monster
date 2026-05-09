"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ShoppingBag,
  Clock,
  RotateCcw,
} from "lucide-react";
import { Button, Card, Badge, Tabs, EmptyState, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/hooks/use-auth";
import { useCartStore } from "@/lib/stores/cart-store";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/utils/helpers";
import { ORDER_STATUS_LABELS } from "@/lib/utils/constants";
import type { Order, OrderItem } from "@/lib/supabase/types";
import toast from "react-hot-toast";

type OrderWithItemCount = Order & { item_count: number; outlet_name: string };

const ACTIVE_STATUSES: Order["status"][] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
];

const PAST_STATUSES: Order["status"][] = ["picked_up", "cancelled"];

const STATUS_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  pending: "warning",
  confirmed: "info",
  preparing: "warning",
  ready: "success",
  picked_up: "default",
  cancelled: "danger",
};

export default function OrderHistoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { addItem, setOutlet } = useCartStore();

  const [activeTab, setActiveTab] = useState("active");
  const [orders, setOrders] = useState<OrderWithItemCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrders() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();

        // Fetch orders
        const { data: ordersData } = await supabase
          .from("orders")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        const fetchedOrders = (ordersData as Order[] | null) ?? [];

        // Fetch item counts and outlet names for each order
        const enrichedOrders: OrderWithItemCount[] = await Promise.all(
          fetchedOrders.map(async (order) => {
            const { data: itemsData } = await supabase
              .from("order_items")
              .select("id")
              .eq("order_id", order.id);

            const items = (itemsData as { id: string }[] | null) ?? [];

            const { data: outletData } = await supabase
              .from("outlets")
              .select("name")
              .eq("id", order.outlet_id)
              .single();

            const outletRow = outletData as { name: string } | null;

            return {
              ...order,
              item_count: items.length,
              outlet_name: outletRow?.name ?? "Unknown Outlet",
            };
          })
        );

        setOrders(enrichedOrders);
      } catch (err) {
        console.error("Failed to fetch orders:", err);
      }
      setLoading(false);
    }

    if (!authLoading) {
      fetchOrders();
    }
  }, [user, authLoading]);

  const activeOrders = orders.filter((o) =>
    ACTIVE_STATUSES.includes(o.status)
  );
  const pastOrders = orders.filter((o) => PAST_STATUSES.includes(o.status));
  const displayedOrders = activeTab === "active" ? activeOrders : pastOrders;

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

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-brand-gray-200">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1 -ml-1 rounded-lg hover:bg-brand-gray-100 transition-colors"
            >
              <ChevronLeft className="h-6 w-6 text-brand-black" />
            </button>
            <h1 className="text-xl font-bold font-[family-name:var(--font-heading)] text-brand-black">
              My Orders
            </h1>
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
                  <p className="font-bold font-[family-name:var(--font-heading)] text-brand-black text-sm">
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

              {/* Reorder button for past orders */}
              {PAST_STATUSES.includes(order.status) &&
                order.status !== "cancelled" && (
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
