"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Clock,
  CheckCircle2,
  ChefHat,
  PackageCheck,
  ToggleLeft,
  ToggleRight,
  Volume2,
  VolumeX,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/helpers";
import type { Order, OrderItem } from "@/lib/supabase/types";
import {
  DeliveryCode,
  DeliveryCodeVerifier,
} from "@/components/restaurant/delivery-code";

type OrderStatus = "pending" | "confirmed" | "preparing" | "ready";

interface QueueOrder extends Order {
  items: OrderItem[];
  customer_name: string;
}

const TABS: { key: OrderStatus; label: string; icon: React.ReactNode }[] = [
  { key: "pending", label: "New", icon: <Clock className="w-4 h-4" /> },
  { key: "confirmed", label: "Accepted", icon: <CheckCircle2 className="w-4 h-4" /> },
  { key: "preparing", label: "Preparing", icon: <ChefHat className="w-4 h-4" /> },
  { key: "ready", label: "Ready", icon: <PackageCheck className="w-4 h-4" /> },
];

const TAB_COLORS: Record<OrderStatus, string> = {
  pending: "bg-amber-500",
  confirmed: "bg-blue-500",
  preparing: "bg-orange-500",
  ready: "bg-brand-green",
};


export default function RestaurantOrdersPage() {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [activeTab, setActiveTab] = useState<OrderStatus>("pending");
  const [autoAccept, setAutoAccept] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [verifyingOrderId, setVerifyingOrderId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoAcceptRef = useRef(false);

  useEffect(() => {
    const savedAutoAccept = localStorage.getItem("pnut_auto_accept");
    if (savedAutoAccept === "true") {
      setAutoAccept(true);
      autoAcceptRef.current = true;
    }

    const savedSound = localStorage.getItem("pnut_order_sound");
    if (savedSound === "false") setSoundEnabled(false);

    loadOrders();
  }, []);

  // Set up realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const outletId = localStorage.getItem("pnut_selected_outlet");

    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel("restaurant-orders")
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: outletId ? `outlet_id=eq.${outletId}` : undefined,
          } as never,
          (payload: { eventType: string; new: Order }) => {
            if (payload.eventType === "INSERT") {
              // New order — play sound and reload
              playNotificationSound();
              // Auto-accept if enabled
              if (autoAcceptRef.current && payload.new.status === "pending") {
                const sb = createClient();
                sb.from("orders")
                  .update({ status: "confirmed" } as never)
                  .eq("id", payload.new.id as never)
                  .then(() => loadOrders());
              } else {
                loadOrders();
              }
            } else if (payload.eventType === "UPDATE") {
              // Status changed — update in place
              setOrders((prev) =>
                prev.map((o) =>
                  o.id === payload.new.id
                    ? { ...o, ...payload.new }
                    : o
                )
              );
            }
          }
        )
        .subscribe();
    } catch {
      // Realtime not available in dev — that's fine
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioRef.current) {
        // Create a simple beep using AudioContext
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.3;
        osc.start();
        setTimeout(() => {
          osc.stop();
          ctx.close();
        }, 200);
      }
    } catch {
      // Audio not supported
    }
  }, [soundEnabled]);

  const loadOrders = useCallback(async () => {
    const supabase = createClient();
    const outletId = localStorage.getItem("pnut_selected_outlet");

    try {
      let query = supabase
        .from("orders")
        .select("*, order_items(*)")
        .in("status", ["pending", "confirmed", "preparing", "ready"])
        .order("created_at", { ascending: false });

      if (outletId) {
        query = query.eq("outlet_id", outletId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const typed = (data ?? []) as (Order & { order_items: OrderItem[] })[];
      const queue: QueueOrder[] = typed.map((o) => ({
        ...o,
        items: o.order_items,
        customer_name: "Customer",
      }));

      // Auto-accept pending orders if enabled
      if (autoAcceptRef.current) {
        const pendingOrders = queue.filter((o) => o.status === "pending");
        if (pendingOrders.length > 0) {
          for (const pending of pendingOrders) {
            await supabase
              .from("orders")
              .update({ status: "confirmed" } as never)
              .eq("id", pending.id as never);
            pending.status = "confirmed";
          }
        }
      }

      setOrders(queue);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
      setLoading(false);
    }
  }, []);

  // Poll every 15 seconds as fallback for realtime
  useEffect(() => {
    const interval = setInterval(loadOrders, 15000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  async function updateOrderStatus(
    orderId: string,
    newStatus: "confirmed" | "preparing" | "ready" | "picked_up"
  ) {
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus } as never)
        .eq("id", orderId as never);

      if (error) throw error;
    } catch {
      console.error("[Restaurant Orders] Failed to update status");
    }

    // Update locally regardless
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: newStatus as Order["status"] } : o
      )
    );

    // If completed, remove from active queue after a brief delay
    if (newStatus === "picked_up") {
      setTimeout(() => {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      }, 500);
    }
  }

  async function rejectOrder(orderId: string) {
    const supabase = createClient();

    try {
      const { data, error } = await supabase.rpc("reject_order_with_refund" as never, {
        p_order_id: orderId,
      } as never);

      if (error) throw error;

      const result = data as { refunded: number } | null;
      if (result && result.refunded > 0) {
        alert(`Order rejected. ₹${result.refunded} refunded to customer wallet.`);
      }
    } catch (err) {
      console.error("[Restaurant Orders] Failed to reject order:", err);
      // Fallback: just cancel without refund
      try {
        await supabase
          .from("orders")
          .update({ status: "cancelled" } as never)
          .eq("id", orderId as never);
      } catch {
        console.error("[Restaurant Orders] Fallback cancel also failed");
      }
    }

    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  function handleAutoAcceptToggle() {
    const next = !autoAccept;
    setAutoAccept(next);
    autoAcceptRef.current = next;
    localStorage.setItem("pnut_auto_accept", String(next));
  }

  function handleSoundToggle() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("pnut_order_sound", String(next));
  }

  function timeSince(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  }

  const filteredOrders = orders.filter((o) => o.status === activeTab);
  const tabCounts = {
    pending: orders.filter((o) => o.status === "pending").length,
    confirmed: orders.filter((o) => o.status === "confirmed").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
    ready: orders.filter((o) => o.status === "ready").length,
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 w-28 bg-white rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoAcceptToggle}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-brand-gray-200 text-sm font-medium hover:shadow-sm transition-shadow"
          >
            {autoAccept ? (
              <ToggleRight className="w-5 h-5 text-brand-green" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-brand-gray-400" />
            )}
            <span className={autoAccept ? "text-brand-green" : "text-brand-gray-500"}>
              Auto-Accept
            </span>
          </button>

          <button
            type="button"
            onClick={handleSoundToggle}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-brand-gray-200 text-sm font-medium hover:shadow-sm transition-shadow"
            aria-label={soundEnabled ? "Mute sounds" : "Enable sounds"}
          >
            {soundEnabled ? (
              <Volume2 className="w-5 h-5 text-brand-green" />
            ) : (
              <VolumeX className="w-5 h-5 text-brand-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? `${TAB_COLORS[tab.key]} text-white shadow-sm`
                : "bg-white text-brand-gray-600 border border-brand-gray-200 hover:bg-brand-gray-50"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tabCounts[tab.key] > 0 && (
              <span
                className={`min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center ${
                  activeTab === tab.key
                    ? "bg-white/30 text-white"
                    : "bg-brand-gray-200 text-brand-gray-700"
                }`}
              >
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Order cards */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-brand-gray-200 p-8 text-center">
          <AlertCircle className="w-10 h-10 text-brand-gray-300 mx-auto mb-2" />
          <p className="text-sm text-brand-gray-500 font-medium">
            No {TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} orders
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              timeSince={timeSince}
              onAccept={() => updateOrderStatus(order.id, "confirmed")}
              onReject={() => rejectOrder(order.id)}
              onStartPreparing={() => updateOrderStatus(order.id, "preparing")}
              onMarkReady={() => updateOrderStatus(order.id, "ready")}
              onComplete={() => updateOrderStatus(order.id, "picked_up")}
              isVerifying={verifyingOrderId === order.id}
              onStartVerify={() => setVerifyingOrderId(order.id)}
              onCancelVerify={() => setVerifyingOrderId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Order Card ─────────────────────────────────────────────────────

function OrderCard({
  order,
  timeSince,
  onAccept,
  onReject,
  onStartPreparing,
  onMarkReady,
  onComplete,
  isVerifying,
  onStartVerify,
  onCancelVerify,
}: {
  order: QueueOrder;
  timeSince: (d: string) => string;
  onAccept: () => void;
  onReject: () => void;
  onStartPreparing: () => void;
  onMarkReady: () => void;
  onComplete: () => void;
  isVerifying: boolean;
  onStartVerify: () => void;
  onCancelVerify: () => void;
}) {
  const borderColor: Record<string, string> = {
    pending: "border-l-amber-500",
    confirmed: "border-l-blue-500",
    preparing: "border-l-orange-500",
    ready: "border-l-brand-green",
  };

  return (
    <div
      className={`bg-white rounded-2xl border border-brand-gray-200 border-l-4 ${
        borderColor[order.status] ?? ""
      } overflow-hidden`}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-base font-bold text-brand-black">
              #{order.order_number}
            </p>
            <p className="text-xs text-brand-gray-500">{order.customer_name}</p>
          </div>
          <span className="text-xs text-brand-gray-400 font-medium">
            {timeSince(order.created_at)}
          </span>
        </div>

        {/* Items */}
        <div className="space-y-1.5 mb-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-brand-gray-700">
                <span className="font-semibold text-brand-black">{item.quantity}x</span>{" "}
                {item.item_name}
              </span>
              <span className="text-brand-gray-500 shrink-0 ml-2">
                {formatCurrency(item.total_price)}
              </span>
            </div>
          ))}
        </div>

        {/* Special notes */}
        {order.notes && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mb-3">
            <p className="text-xs text-orange-700 font-medium">
              <span className="font-bold">Note:</span> {order.notes}
            </p>
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-between py-2 border-t border-brand-gray-100">
          <span className="text-sm text-brand-gray-500 font-medium">Total</span>
          <span className="text-lg font-bold text-brand-black">
            {formatCurrency(order.total)}
          </span>
        </div>

        {/* Delivery Code (for ready orders) */}
        {order.status === "ready" && !isVerifying && (
          <div className="mt-3 pt-3 border-t border-brand-gray-100">
            <DeliveryCode orderNumber={order.order_number} size="sm" />
          </div>
        )}

        {/* Delivery Code Verifier */}
        {order.status === "ready" && isVerifying && (
          <div className="mt-3 pt-3 border-t border-brand-gray-100">
            <DeliveryCodeVerifier
              orderNumber={order.order_number}
              onVerified={onComplete}
              onCancel={onCancelVerify}
            />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-4">
        {order.status === "pending" && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onReject}
              className="flex-1 py-2.5 rounded-xl border-2 border-brand-red text-brand-red font-semibold text-sm hover:bg-red-50 transition-colors"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="flex-1 py-2.5 rounded-xl bg-brand-green text-white font-semibold text-sm hover:bg-brand-green-dark transition-colors"
            >
              Accept
            </button>
          </div>
        )}

        {order.status === "confirmed" && (
          <button
            type="button"
            onClick={onStartPreparing}
            className="w-full py-2.5 rounded-xl bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition-colors"
          >
            Start Preparing
          </button>
        )}

        {order.status === "preparing" && (
          <button
            type="button"
            onClick={onMarkReady}
            className="w-full py-2.5 rounded-xl bg-brand-green text-white font-semibold text-sm hover:bg-brand-green-dark transition-colors"
          >
            Ready for Pickup
          </button>
        )}

        {order.status === "ready" && !isVerifying && (
          <button
            type="button"
            onClick={onStartVerify}
            className="w-full py-2.5 rounded-xl bg-brand-black text-white font-semibold text-sm hover:bg-brand-gray-800 transition-colors"
          >
            Complete with Code Verification
          </button>
        )}
      </div>
    </div>
  );
}
