"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Order, Profile } from "@/lib/supabase/types";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils/helpers";
import { ORDER_STATUS_LABELS } from "@/lib/utils/constants";
import { Tabs, Badge, Spinner } from "@/components/ui";
import {
  Clock,
  Package,
  ChevronDown,
  RefreshCw,
  User,
  ShoppingBag,
  Undo2,
} from "lucide-react";

type OrderStatus = Order["status"];

type OrderWithProfile = Order & {
  profiles: Pick<Profile, "full_name" | "phone"> | null;
  item_count?: number;
};

const STATUS_TABS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready", value: "ready" },
  { label: "Cancelled", value: "cancelled" },
];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "picked_up",
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  pending: "warning",
  confirmed: "info",
  preparing: "warning",
  ready: "success",
  picked_up: "default",
  cancelled: "danger",
};

function timeSince(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const supabase = createClient();

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, profiles!orders_user_id_fkey(full_name, phone)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data as OrderWithProfile[] | null) ?? [];

      // Fetch item counts per order
      if (rows.length > 0) {
        const orderIds = rows.map((o) => o.id);
        const { data: itemData } = await supabase
          .from("order_items")
          .select("order_id, quantity")
          .in("order_id", orderIds);

        const items = (itemData as { order_id: string; quantity: number }[] | null) ?? [];
        const countMap: Record<string, number> = {};
        for (const item of items) {
          countMap[item.order_id] = (countMap[item.order_id] || 0) + item.quantity;
        }
        for (const order of rows) {
          order.item_count = countMap[order.id] || 0;
        }
      }

      setOrders(rows);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("admin-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchOrders]);

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingId(orderId);
    await supabase
      .from("orders")
      .update({ status: newStatus } as never)
      .eq("id", orderId);
    setUpdatingId(null);
    // Realtime will trigger a refresh, but also update locally
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
  };

  const handleManualRefund = async (orderId: string) => {
    if (!confirm("Refund wallet amount for this cancelled order?")) return;
    setRefundingId(orderId);
    try {
      const { data, error } = await supabase.rpc("manual_refund_order" as never, {
        p_order_id: orderId,
      } as never);

      if (error) {
        alert(error.message);
        setRefundingId(null);
        return;
      }

      const result = data as { refunded: number } | null;
      alert(`Refunded ₹${result?.refunded ?? 0} to customer wallet.`);

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, payment_status: "refunded" } : o
        )
      );
    } catch (err) {
      console.error("Refund failed:", err);
      alert("Refund failed. Please try again.");
    }
    setRefundingId(null);
  };

  const filtered =
    activeTab === "all"
      ? orders
      : orders.filter((o) => o.status === activeTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-gray-500">
          {filtered.length} order{filtered.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={fetchOrders}
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand-gray-600 hover:text-brand-black transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 px-2 pt-2">
        <Tabs tabs={STATUS_TABS} value={activeTab} onChange={setActiveTab} />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-brand-gray-400">
          <ShoppingBag className="w-12 h-12 mb-3" />
          <p className="text-base font-semibold">No orders found</p>
          <p className="text-sm mt-1">Orders will appear here in real-time</p>
        </div>
      )}

      {/* Order Cards Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((order) => {
            const nextStatus = NEXT_STATUS[order.status];
            return (
              <div
                key={order.id}
                className="bg-white rounded-xl shadow-sm border border-brand-gray-100 p-5 flex flex-col gap-4"
              >
                {/* Top row */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-bold font-[family-name:var(--font-heading)] text-brand-black">
                      #{order.order_number}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-brand-gray-500">
                      <User className="w-3.5 h-3.5" />
                      <span>
                        {order.profiles?.full_name || "Unknown Customer"}
                      </span>
                    </div>
                  </div>
                  <Badge variant={STATUS_BADGE_VARIANT[order.status] ?? "default"}>
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                </div>

                {/* Details */}
                <div className="flex items-center gap-4 text-sm text-brand-gray-600">
                  <span className="flex items-center gap-1">
                    <Package className="w-4 h-4" />
                    {order.item_count ?? 0} item
                    {(order.item_count ?? 0) !== 1 ? "s" : ""}
                  </span>
                  <span className="font-bold text-brand-black">
                    {formatCurrency(order.total)}
                  </span>
                  <span className="flex items-center gap-1 ml-auto text-brand-gray-400">
                    <Clock className="w-3.5 h-3.5" />
                    {timeSince(order.created_at)}
                  </span>
                </div>

                {/* Action */}
                {nextStatus && (
                  <button
                    disabled={updatingId === order.id}
                    onClick={() => updateStatus(order.id, nextStatus)}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold font-[family-name:var(--font-heading)] transition-colors",
                      "bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark disabled:opacity-50"
                    )}
                  >
                    {updatingId === order.id ? (
                      <Spinner size="sm" className="text-brand-black" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    Move to {ORDER_STATUS_LABELS[nextStatus]}
                  </button>
                )}

                {order.status === "cancelled" &&
                  order.payment_status !== "refunded" &&
                  order.wallet_used > 0 && (
                    <button
                      disabled={refundingId === order.id}
                      onClick={() => handleManualRefund(order.id)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold font-[family-name:var(--font-heading)] transition-colors bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      {refundingId === order.id ? (
                        <Spinner size="sm" className="text-white" />
                      ) : (
                        <Undo2 className="w-4 h-4" />
                      )}
                      Refund {formatCurrency(order.wallet_used)} to Wallet
                    </button>
                  )}

                {order.status === "cancelled" &&
                  order.payment_status === "refunded" && (
                    <div className="w-full text-center py-2.5 rounded-xl text-sm font-semibold bg-green-50 text-green-700 border border-green-200">
                      Refunded
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
