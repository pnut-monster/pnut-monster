/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner, Badge } from "@/components/ui";
import { Phone, MapPin, Package, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";

type BatchOrder = {
  id: string;
  order_id: string;
  delivery_status: string;
  sub_location_text: string | null;
  sub_location: { name: string } | null;
  order: {
    order_number: string;
    notes: string | null;
    total: number;
    user: { full_name: string; phone: string } | null;
    items: { item_name: string; quantity: number; customizations: unknown[] }[];
  };
};

const STATUS_COLORS: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
  pending: "neutral",
  out_for_delivery: "info",
  delivered: "success",
  undeliverable: "error",
};

export default function RepOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<BatchOrder[]>([]);
  const [flagging, setFlagging] = useState<string | null>(null);

  async function loadOrders() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: rep } = await supabase
      .from("representatives")
      .select("id, outlet_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!rep) { setLoading(false); return; }

    // Get latest processing/closed window
    const { data: window } = await supabase
      .from("batch_windows")
      .select("id")
      .eq("outlet_id", rep.outlet_id)
      .in("status", ["processing", "closed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!window) { setLoading(false); return; }

    // Get assigned orders with details
    const { data: batchOrders } = await supabase
      .from("batch_orders")
      .select(`
        id, order_id, delivery_status, sub_location_text,
        sub_location:delivery_sub_locations(name)
      `)
      .eq("batch_window_id", window.id)
      .eq("rep_id", rep.id)
      .order("delivery_status");

    if (!batchOrders || batchOrders.length === 0) { setLoading(false); return; }

    // Get order details
    const orderIds = batchOrders.map(bo => bo.order_id);
    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, order_number, notes, total, user_id")
      .in("id", orderIds);

    const { data: orderItemsData } = await supabase
      .from("order_items")
      .select("order_id, item_name, quantity, customizations")
      .in("order_id", orderIds);

    // Get customer profiles
    const userIds = [...new Set(ordersData?.map(o => o.user_id) || [])];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", userIds);

    // Assemble
    const assembled: BatchOrder[] = batchOrders.map(bo => {
      const order = ordersData?.find(o => o.id === bo.order_id);
      const items = orderItemsData?.filter(i => i.order_id === bo.order_id) || [];
      const profile = profiles?.find(p => p.id === order?.user_id);
      return {
        ...bo,
        sub_location: bo.sub_location as unknown as { name: string } | null,
        order: {
          order_number: order?.order_number || "—",
          notes: order?.notes || null,
          total: order?.total || 0,
          user: profile ? { full_name: profile.full_name || "—", phone: profile.phone || "—" } : null,
          items: items.map(i => ({ item_name: i.item_name, quantity: i.quantity, customizations: i.customizations as unknown[] })),
        },
      };
    }) as BatchOrder[];

    setOrders(assembled);
    setLoading(false);
  }

  useEffect(() => { loadOrders(); }, []);

  async function flagUndeliverable(orderId: string) {
    const reason = prompt("Reason? (customer_not_responding / wrong_location / other)");
    if (!reason) return;
    setFlagging(orderId);
    const supabase = createClient();
    const { error } = await supabase.rpc("flag_undeliverable", {
      p_order_id: orderId,
      p_reason: reason,
      p_note: null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Order flagged"); loadOrders(); }
    setFlagging(null);
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  if (orders.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Package size={40} className="mx-auto mb-3 opacity-50" />
        <p>No orders assigned yet</p>
        <p className="text-xs mt-1">Wait for the batch to close and orders to be distributed</p>
      </div>
    );
  }

  const pending = orders.filter(o => o.delivery_status !== "delivered" && o.delivery_status !== "undeliverable");
  const completed = orders.filter(o => o.delivery_status === "delivered" || o.delivery_status === "undeliverable");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">My Orders</h1>
        <span className="text-xs text-gray-500">{pending.length} pending · {completed.length} done</span>
      </div>

      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase">Pending Delivery</p>
          {pending.map(order => (
            <OrderCard key={order.id} order={order} onFlag={flagUndeliverable} flagging={flagging} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-3 mt-6">
          <p className="text-xs font-medium text-gray-500 uppercase">Completed</p>
          {completed.map(order => (
            <OrderCard key={order.id} order={order} onFlag={flagUndeliverable} flagging={flagging} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, onFlag, flagging }: { order: BatchOrder; onFlag: (id: string) => void; flagging: string | null }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-gray-500">#{order.order.order_number}</span>
        <Badge variant={STATUS_COLORS[order.delivery_status] || "neutral"}>
          {order.delivery_status.replace("_", " ")}
        </Badge>
      </div>

      {/* Customer */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">{order.order.user?.full_name || "—"}</span>
        {order.order.user?.phone && (
          <a href={`tel:${order.order.user.phone}`} className="text-brand-green">
            <Phone size={14} />
          </a>
        )}
      </div>

      {/* Location */}
      <div className="flex items-center gap-1 text-xs text-gray-600">
        <MapPin size={12} />
        {order.sub_location?.name || order.sub_location_text || "No sub-location"}
      </div>

      {/* Items */}
      <div className="text-xs text-gray-600 space-y-0.5">
        {order.order.items.map((item, i) => (
          <p key={i}>{item.quantity}x {item.item_name}</p>
        ))}
      </div>

      {/* Notes */}
      {order.order.notes && (
        <p className="text-xs text-orange-600 italic">&quot;{order.order.notes}&quot;</p>
      )}

      {/* Actions */}
      {order.delivery_status !== "delivered" && order.delivery_status !== "undeliverable" && (
        <button onClick={() => onFlag(order.order_id)}
          disabled={flagging === order.order_id}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 mt-1">
          <AlertTriangle size={12} />
          {flagging === order.order_id ? "Flagging..." : "Can't deliver"}
        </button>
      )}
    </div>
  );
}
