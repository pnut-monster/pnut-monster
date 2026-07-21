"use client";

import { useState, useEffect } from "react";
import {
  ShoppingBag,
  IndianRupee,
  TrendingUp,
  Clock,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/helpers";
import { ORDER_STATUS_LABELS } from "@/lib/utils/constants";
import type { Order, OrderItem } from "@/lib/supabase/types";

interface DashboardStats {
  ordersToday: number;
  revenueToday: number;
  avgOrderValue: number;
  pendingOrders: number;
}

interface ActiveOrder extends Order {
  items: OrderItem[];
  customer_name: string;
}

export default function RestaurantDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    ordersToday: 0,
    revenueToday: 0,
    avgOrderValue: 0,
    pendingOrders: 0,
  });
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [autoAccept, setAutoAccept] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load auto-accept from localStorage
    const saved = localStorage.getItem("pnut_auto_accept");
    if (saved === "true") setAutoAccept(true);

    // The initial loader is a stable function declaration scoped to this page.
    // eslint-disable-next-line react-hooks/immutability
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    const supabase = createClient();
    const outletId = localStorage.getItem("pnut_selected_outlet");

    try {
      // Fetch today's orders for this outlet
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      let query = supabase
        .from("orders")
        .select("*, order_items(*)")
        .gte("created_at", todayStart.toISOString())
        .order("created_at", { ascending: false });

      if (outletId) {
        query = query.eq("outlet_id", outletId);
      }

      const { data: orders, error } = await query;

      if (error) throw error;

      const typedOrders = (orders ?? []) as (Order & { order_items: OrderItem[] })[];

      // Compute stats
      const revenue = typedOrders.reduce((sum, o) => sum + o.total, 0);
      const pending = typedOrders.filter((o) => o.status === "pending").length;

      setStats({
        ordersToday: typedOrders.length,
        revenueToday: revenue,
        avgOrderValue: typedOrders.length > 0 ? Math.round(revenue / typedOrders.length) : 0,
        pendingOrders: pending,
      });

      // Active orders = not picked_up or cancelled
      const active = typedOrders
        .filter((o) => !["picked_up", "cancelled"].includes(o.status))
        .map((o) => ({
          ...o,
          items: o.order_items,
          customer_name: "Customer", // In production, join with profiles
        }));

      setActiveOrders(active);
      setLoading(false);
      return;
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
      setLoading(false);
    }
  }

  function handleAutoAcceptToggle() {
    const next = !autoAccept;
    setAutoAccept(next);
    localStorage.setItem("pnut_auto_accept", String(next));
  }

  function timeSince(dateStr: string): string {
    // Relative time is intentionally evaluated when the dashboard renders.
    // eslint-disable-next-line react-hooks/purity
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  }

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    confirmed: "bg-blue-100 text-blue-800 border-blue-200",
    preparing: "bg-orange-100 text-orange-800 border-orange-200",
    ready: "bg-green-100 text-green-800 border-green-200",
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-5 animate-pulse h-28"
            />
          ))}
        </div>
        <div className="bg-white rounded-2xl p-6 animate-pulse h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Today's Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Orders Today"
          value={String(stats.ordersToday)}
          icon={<ShoppingBag className="w-5 h-5" />}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Revenue Today"
          value={formatCurrency(stats.revenueToday)}
          icon={<IndianRupee className="w-5 h-5" />}
          color="bg-green-50 text-green-600"
        />
        <StatCard
          label="Avg Order Value"
          value={formatCurrency(stats.avgOrderValue)}
          icon={<TrendingUp className="w-5 h-5" />}
          color="bg-purple-50 text-purple-600"
        />
        <StatCard
          label="Pending Orders"
          value={String(stats.pendingOrders)}
          icon={<Clock className="w-5 h-5" />}
          color="bg-amber-50 text-amber-600"
          highlight={stats.pendingOrders > 0}
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-brand-gray-200 p-5">
        <h2 className="font-heading text-lg font-bold text-brand-black mb-3">
          Quick Actions
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-brand-gray-700">
              Auto-Accept Orders
            </p>
            <p className="text-xs text-brand-gray-500 mt-0.5">
              Automatically accept new orders without manual confirmation
            </p>
          </div>
          <button
            type="button"
            onClick={handleAutoAcceptToggle}
            className="shrink-0"
            aria-label={autoAccept ? "Disable auto-accept" : "Enable auto-accept"}
          >
            {autoAccept ? (
              <ToggleRight className="w-10 h-10 text-brand-green" />
            ) : (
              <ToggleLeft className="w-10 h-10 text-brand-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Active Orders */}
      <div>
        <h2 className="font-heading text-lg font-bold text-brand-black mb-3">
          Active Orders
        </h2>

        {activeOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-brand-gray-200 p-8 text-center">
            <ShoppingBag className="w-10 h-10 text-brand-gray-300 mx-auto mb-2" />
            <p className="text-sm text-brand-gray-500 font-medium">
              No active orders right now
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeOrders.map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-brand-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-brand-black">
                      #{order.order_number}
                    </p>
                    <p className="text-xs text-brand-gray-500">
                      {order.customer_name}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      statusColors[order.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </div>

                {/* Items */}
                <div className="space-y-1 mb-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-brand-gray-700">
                        {item.quantity}x {item.item_name}
                      </span>
                      <span className="text-brand-gray-500 shrink-0 ml-2">
                        {formatCurrency(item.total_price)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                {order.notes && (
                  <p className="text-xs text-brand-orange bg-orange-50 px-2 py-1 rounded-lg mb-3 font-medium">
                    Note: {order.notes}
                  </p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-brand-gray-100">
                  <span className="text-xs text-brand-gray-400">
                    {timeSince(order.created_at)}
                  </span>
                  <span className="text-sm font-bold text-brand-black">
                    {formatCurrency(order.total)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border p-5 ${
        highlight
          ? "border-amber-300 ring-1 ring-amber-200"
          : "border-brand-gray-200"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
        {highlight && (
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
        )}
      </div>
      <p className="text-2xl font-bold text-brand-black font-heading">{value}</p>
      <p className="text-xs text-brand-gray-500 mt-0.5 font-medium">{label}</p>
    </div>
  );
}
