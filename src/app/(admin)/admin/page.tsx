"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Order, Profile, Outlet } from "@/lib/supabase/types";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils/helpers";
import { ORDER_STATUS_LABELS } from "@/lib/utils/constants";
import { Badge, Spinner } from "@/components/ui";
import {
  ShoppingBag,
  DollarSign,
  Users,
  MapPin,
  Clock,
} from "lucide-react";

type DashboardStats = {
  totalOrders: number;
  todayRevenue: number;
  activeCustomers: number;
  activeOutlets: number;
};

type RecentOrder = {
  id: string;
  order_number: string;
  customer_name: string;
  outlet_name: string;
  total: number;
  status: string;
  created_at: string;
};

type PopularItem = {
  name: string;
  count: number;
};

type RevenueDay = {
  day: string;
  count: number;
  revenue: number;
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0,
    todayRevenue: 0,
    activeCustomers: 0,
    activeOutlets: 0,
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [popularItems, setPopularItems] = useState<PopularItem[]>([]);
  const [revenueDays, setRevenueDays] = useState<RevenueDay[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch stats in parallel
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [ordersRes, profilesRes, outletsRes, todayOrdersRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
        supabase.from("outlets").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("orders").select("total").gte("created_at", todayStart.toISOString()),
      ]);

      if (ordersRes.error || profilesRes.error || outletsRes.error || todayOrdersRes.error) {
        throw new Error("Stats query failed");
      }

      const todayOrders = (todayOrdersRes.data as { total: number }[] | null) ?? [];
      const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total, 0);

      setStats({
        totalOrders: ordersRes.count ?? 0,
        todayRevenue,
        activeCustomers: profilesRes.count ?? 0,
        activeOutlets: outletsRes.count ?? 0,
      });

      // Recent orders with customer and outlet names
      const { data: recentData, error: recentError } = await supabase
        .from("orders")
        .select("id, order_number, user_id, outlet_id, total, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      if (recentError) throw recentError;

      const orders = (recentData as Order[] | null) ?? [];

      if (orders.length > 0) {
        const userIds = [...new Set(orders.map((o) => o.user_id))];
        const outletIds = [...new Set(orders.map((o) => o.outlet_id))];

        const [profilesDataRes, outletsDataRes] = await Promise.all([
          supabase.from("profiles").select("id, full_name").in("id", userIds),
          supabase.from("outlets").select("id, name").in("id", outletIds),
        ]);

        const profileMap: Record<string, string> = {};
        for (const p of ((profilesDataRes.data as Pick<Profile, "id" | "full_name">[]) ?? [])) {
          profileMap[p.id] = p.full_name ?? "Unknown";
        }

        const outletMap: Record<string, string> = {};
        for (const o of ((outletsDataRes.data as Pick<Outlet, "id" | "name">[]) ?? [])) {
          outletMap[o.id] = o.name;
        }

        setRecentOrders(
          orders.map((o) => ({
            id: o.id,
            order_number: o.order_number,
            customer_name: profileMap[o.user_id] ?? "Unknown",
            outlet_name: outletMap[o.outlet_id] ?? "Unknown",
            total: o.total,
            status: o.status,
            created_at: o.created_at,
          }))
        );
      }

      // Popular items: count order_items grouped by item_name
      const { data: orderItemsData } = await supabase
        .from("order_items")
        .select("item_name, quantity");

      if (orderItemsData && orderItemsData.length > 0) {
        const countMap: Record<string, number> = {};
        for (const oi of orderItemsData as { item_name: string; quantity: number }[]) {
          countMap[oi.item_name] = (countMap[oi.item_name] || 0) + oi.quantity;
        }
        const sorted = Object.entries(countMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name, count }));
        setPopularItems(sorted);
      }

      // Revenue last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
      const { data: revenueData } = await supabase
        .from("orders")
        .select("total, created_at")
        .gte("created_at", sevenDaysAgo.toISOString());

      if (revenueData && revenueData.length > 0) {
        const dayMap: Record<string, { count: number; revenue: number }> = {};
        for (let i = 6; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          const key = d.toISOString().slice(0, 10);
          dayMap[key] = { count: 0, revenue: 0 };
        }
        for (const o of revenueData as { total: number; created_at: string }[]) {
          const key = o.created_at.slice(0, 10);
          if (dayMap[key]) {
            dayMap[key].count += 1;
            dayMap[key].revenue += o.total;
          }
        }
        setRevenueDays(
          Object.entries(dayMap).map(([day, data]) => ({
            day: new Date(day).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
            ...data,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const STAT_CARDS = [
    {
      label: "Total Orders",
      value: stats.totalOrders.toLocaleString(),
      icon: ShoppingBag,
      color: "bg-brand-yellow/10 text-brand-yellow-dark",
    },
    {
      label: "Revenue Today",
      value: formatCurrency(stats.todayRevenue),
      icon: DollarSign,
      color: "bg-brand-green/10 text-brand-green-dark",
    },
    {
      label: "Active Customers",
      value: stats.activeCustomers.toLocaleString(),
      icon: Users,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Active Outlets",
      value: stats.activeOutlets.toLocaleString(),
      icon: MapPin,
      color: "bg-purple-50 text-purple-600",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {STAT_CARDS.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-xl p-5 shadow-sm border border-brand-gray-100"
            >
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <p className="mt-4 text-2xl font-bold font-heading text-brand-black">
                {stat.value}
              </p>
              <p className="text-sm text-brand-gray-500 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Recent Orders + Popular Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Orders */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-brand-gray-100">
          <h3 className="font-heading text-lg font-bold text-brand-black mb-4">
            Recent Orders
          </h3>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-brand-gray-400 text-center py-6">No orders yet</p>
          ) : (
            <div className="space-y-0 divide-y divide-brand-gray-100">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-brand-black">
                      #{order.order_number}
                    </p>
                    <p className="text-xs text-brand-gray-500 truncate">
                      {order.customer_name} - {order.outlet_name}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-brand-black shrink-0">
                    {formatCurrency(order.total)}
                  </p>
                  <Badge
                    variant={
                      order.status === "picked_up"
                        ? "success"
                        : order.status === "cancelled"
                        ? "danger"
                        : order.status === "preparing"
                        ? "warning"
                        : "default"
                    }
                  >
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                  <span className="text-xs text-brand-gray-400 hidden sm:flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    {formatDateTime(order.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Popular Items */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-brand-gray-100">
          <h3 className="font-heading text-lg font-bold text-brand-black mb-4">
            Popular Items
          </h3>
          {popularItems.length === 0 ? (
            <p className="text-sm text-brand-gray-400 text-center py-6">No order data yet</p>
          ) : (
            <div className="space-y-3">
              {popularItems.map((item, idx) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                    idx === 0 ? "bg-brand-yellow text-brand-black" :
                    idx === 1 ? "bg-brand-gray-200 text-brand-gray-700" :
                    idx === 2 ? "bg-orange-100 text-orange-700" :
                    "bg-brand-gray-100 text-brand-gray-500"
                  )}>
                    {idx + 1}
                  </span>
                  <p className="flex-1 text-sm font-medium text-brand-black truncate">
                    {item.name}
                  </p>
                  <span className="text-sm font-bold text-brand-gray-600 shrink-0">
                    {item.count} orders
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Revenue Chart placeholder - simple table */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-brand-gray-100">
        <h3 className="font-heading text-lg font-bold text-brand-black mb-4">
          Revenue Over Last 7 Days
        </h3>
        {revenueDays.length === 0 ? (
          <p className="text-sm text-brand-gray-400 text-center py-6">No revenue data</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-gray-100 text-left">
                  <th className="px-4 py-2 font-semibold text-brand-gray-500">Day</th>
                  <th className="px-4 py-2 font-semibold text-brand-gray-500 text-right">Orders</th>
                  <th className="px-4 py-2 font-semibold text-brand-gray-500 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-gray-100">
                {revenueDays.map((day) => (
                  <tr key={day.day} className="hover:bg-brand-gray-50">
                    <td className="px-4 py-2.5 text-brand-black font-medium">{day.day}</td>
                    <td className="px-4 py-2.5 text-brand-gray-600 text-right">{day.count}</td>
                    <td className="px-4 py-2.5 text-brand-black font-bold text-right">
                      {formatCurrency(day.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-gray-200">
                  <td className="px-4 py-2.5 font-bold text-brand-black">Total</td>
                  <td className="px-4 py-2.5 font-bold text-brand-black text-right">
                    {revenueDays.reduce((s, d) => s + d.count, 0)}
                  </td>
                  <td className="px-4 py-2.5 font-bold text-brand-black text-right">
                    {formatCurrency(revenueDays.reduce((s, d) => s + d.revenue, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
