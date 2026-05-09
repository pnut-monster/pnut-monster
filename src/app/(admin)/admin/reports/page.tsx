"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Order, OrderItem } from "@/lib/supabase/types";
import { formatCurrency, formatDate, cn } from "@/lib/utils/helpers";
import { Spinner } from "@/components/ui";
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Users,
  Calendar,
} from "lucide-react";

type DateRange = "today" | "7days" | "30days" | "custom";

function getDateStart(range: DateRange, customDate?: string): string {
  const now = new Date();
  if (range === "today") {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (range === "7days") {
    now.setDate(now.getDate() - 7);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (range === "30days") {
    now.setDate(now.getDate() - 30);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (range === "custom" && customDate) {
    return new Date(customDate).toISOString();
  }
  // fallback 30 days
  now.setDate(now.getDate() - 30);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

type TopItem = {
  item_name: string;
  total_qty: number;
  total_revenue: number;
};

type DailyRevenue = {
  date: string;
  order_count: number;
  revenue: number;
};

export default function AdminReportsPage() {
  const [range, setRange] = useState<DateRange>("30days");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [loading, setLoading] = useState(true);

  // Stats
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [avgOrderValue, setAvgOrderValue] = useState(0);
  const [activeCustomers, setActiveCustomers] = useState(0);

  // Top items
  const [topItems, setTopItems] = useState<TopItem[]>([]);

  // Revenue by day
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);

  const supabase = createClient();

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const startDate = getDateStart(range, customStart);
    const endDate =
      range === "custom" && customEnd
        ? new Date(customEnd + "T23:59:59").toISOString()
        : new Date().toISOString();

    // Fetch orders in range (exclude cancelled)
    const { data: orderData } = await supabase
      .from("orders")
      .select("*")
      .gte("created_at", startDate)
      .lte("created_at", endDate)
      .neq("status", "cancelled");

    const orders = (orderData as Order[] | null) ?? [];

    // Stats
    const revenue = orders.reduce((sum, o) => sum + o.total, 0);
    const count = orders.length;
    const avg = count > 0 ? revenue / count : 0;
    const uniqueCustomers = new Set(orders.map((o) => o.user_id)).size;

    setTotalRevenue(revenue);
    setTotalOrders(count);
    setAvgOrderValue(avg);
    setActiveCustomers(uniqueCustomers);

    // Revenue by day
    const dayMap: Record<string, { order_count: number; revenue: number }> = {};
    for (const o of orders) {
      const day = o.created_at.slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { order_count: 0, revenue: 0 };
      dayMap[day].order_count++;
      dayMap[day].revenue += o.total;
    }
    const daily = Object.entries(dayMap)
      .map(([date, vals]) => ({ date, ...vals }))
      .sort((a, b) => b.date.localeCompare(a.date));
    setDailyRevenue(daily);

    // Top items
    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.id);
      // Batch fetch in chunks of 100 to avoid query limits
      const allItems: OrderItem[] = [];
      for (let i = 0; i < orderIds.length; i += 100) {
        const chunk = orderIds.slice(i, i + 100);
        const { data: itemData } = await supabase
          .from("order_items")
          .select("*")
          .in("order_id", chunk);
        const items = (itemData as OrderItem[] | null) ?? [];
        allItems.push(...items);
      }

      const itemMap: Record<string, { total_qty: number; total_revenue: number }> = {};
      for (const item of allItems) {
        if (!itemMap[item.item_name]) {
          itemMap[item.item_name] = { total_qty: 0, total_revenue: 0 };
        }
        itemMap[item.item_name].total_qty += item.quantity;
        itemMap[item.item_name].total_revenue += item.total_price;
      }

      const sorted = Object.entries(itemMap)
        .map(([item_name, vals]) => ({ item_name, ...vals }))
        .sort((a, b) => b.total_qty - a.total_qty)
        .slice(0, 10);

      setTopItems(sorted);
    } else {
      setTopItems([]);
    }

    setLoading(false);
  }, [supabase, range, customStart, customEnd]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const STAT_CARDS = [
    {
      label: "Total Revenue",
      value: formatCurrency(totalRevenue),
      icon: DollarSign,
      color: "bg-green-50 text-brand-green-dark",
    },
    {
      label: "Total Orders",
      value: totalOrders.toLocaleString(),
      icon: ShoppingBag,
      color: "bg-brand-yellow/10 text-brand-yellow-dark",
    },
    {
      label: "Avg Order Value",
      value: formatCurrency(Math.round(avgOrderValue)),
      icon: TrendingUp,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Active Customers",
      value: activeCustomers.toLocaleString(),
      icon: Users,
      color: "bg-purple-50 text-purple-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex flex-wrap items-center gap-3">
        {(
          [
            ["today", "Today"],
            ["7days", "Last 7 Days"],
            ["30days", "Last 30 Days"],
            ["custom", "Custom"],
          ] as [DateRange, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              range === key
                ? "bg-brand-yellow text-brand-black"
                : "bg-white text-brand-gray-600 border border-brand-gray-200 hover:bg-brand-gray-50"
            )}
          >
            {label}
          </button>
        ))}
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-xl border border-brand-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
            />
            <span className="text-brand-gray-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-xl border border-brand-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
            />
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {STAT_CARDS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="bg-white rounded-xl p-5 shadow-sm border border-brand-gray-100"
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="mt-4 text-2xl font-bold font-[family-name:var(--font-heading)] text-brand-black">
                    {stat.value}
                  </p>
                  <p className="text-sm text-brand-gray-500 mt-1">
                    {stat.label}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Two columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Items */}
            <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 p-6">
              <h3 className="font-[family-name:var(--font-heading)] text-lg font-bold text-brand-black mb-4">
                Top Items
              </h3>
              {topItems.length === 0 ? (
                <p className="text-sm text-brand-gray-400 py-8 text-center">
                  No order data in this range
                </p>
              ) : (
                <div className="space-y-3">
                  {topItems.map((item, index) => (
                    <div
                      key={item.item_name}
                      className="flex items-center gap-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-brand-yellow/20 flex items-center justify-center text-xs font-bold text-brand-yellow-dark shrink-0">
                        {index + 1}
                      </span>
                      <span className="flex-1 text-sm font-medium text-brand-black truncate">
                        {item.item_name}
                      </span>
                      <span className="text-sm text-brand-gray-500">
                        {item.total_qty} sold
                      </span>
                      <span className="text-sm font-bold text-brand-black">
                        {formatCurrency(item.total_revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Revenue by Day */}
            <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 p-6">
              <h3 className="font-[family-name:var(--font-heading)] text-lg font-bold text-brand-black mb-4">
                Revenue by Day
              </h3>
              {dailyRevenue.length === 0 ? (
                <p className="text-sm text-brand-gray-400 py-8 text-center">
                  No order data in this range
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-brand-gray-100 text-left">
                        <th className="pb-2 font-semibold text-brand-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            Date
                          </span>
                        </th>
                        <th className="pb-2 font-semibold text-brand-gray-500 text-center">
                          Orders
                        </th>
                        <th className="pb-2 font-semibold text-brand-gray-500 text-right">
                          Revenue
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-gray-100">
                      {dailyRevenue.map((day) => (
                        <tr key={day.date} className="hover:bg-brand-gray-50">
                          <td className="py-2.5 text-brand-black">
                            {formatDate(day.date)}
                          </td>
                          <td className="py-2.5 text-brand-gray-600 text-center">
                            {day.order_count}
                          </td>
                          <td className="py-2.5 font-bold text-brand-black text-right">
                            {formatCurrency(day.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
