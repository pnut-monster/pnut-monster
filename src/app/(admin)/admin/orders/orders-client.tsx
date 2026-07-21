"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Order, Profile } from "@/lib/supabase/types";
import { formatCurrency, cn } from "@/lib/utils/helpers";
import { ORDER_STATUS_LABELS } from "@/lib/utils/constants";
import { Tabs, Badge, Spinner, Modal } from "@/components/ui";
import { generatePickupCode } from "@/components/restaurant/delivery-code";
import {
  Clock,
  Package,
  ChevronDown,
  RefreshCw,
  User,
  ShoppingBag,
  Undo2,
  Check,
  X,
  KeyRound,
} from "lucide-react";
import toast from "react-hot-toast";

type OrderStatus = Order["status"];

type OrderItemDetail = {
  id: string;
  order_id: string;
  item_name: string;
  quantity: number;
  total_price: number;
  customizations: unknown;
};

type OrderWithProfile = Order & {
  profiles: Pick<Profile, "full_name" | "phone"> | null;
  item_count?: number;
  order_items?: OrderItemDetail[];
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
  confirmed: "preparing",
  preparing: "ready",
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  pending: "warning",
  confirmed: "info",
  preparing: "warning",
  ready: "success",
  picked_up: "default",
  cancelled: "danger",
  rejected: "danger",
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

export function AdminOrdersClient() {
  const searchParams = useSearchParams();
  const outletFilter = searchParams.get("outlet");
  const [orders, setOrders] = useState<OrderWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpModalOrder, setOtpModalOrder] = useState<OrderWithProfile | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState(false);
  const supabase = createClient();

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("orders")
        .select("*, profiles!orders_user_id_fkey(full_name, phone)");
      if (outletFilter) query = query.eq("outlet_id", outletFilter);
      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data as OrderWithProfile[] | null) ?? [];

      // Fetch full order items with customizations
      if (rows.length > 0) {
        const orderIds = rows.map((o) => o.id);
        const { data: itemData } = await supabase
          .from("order_items")
          .select("id, order_id, item_name, quantity, total_price, customizations")
          .in("order_id", orderIds);

        const items = (itemData as OrderItemDetail[] | null) ?? [];
        const itemsMap: Record<string, OrderItemDetail[]> = {};
        const countMap: Record<string, number> = {};
        for (const item of items) {
          if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
          itemsMap[item.order_id].push(item);
          countMap[item.order_id] = (countMap[item.order_id] || 0) + item.quantity;
        }
        for (const order of rows) {
          order.item_count = countMap[order.id] || 0;
          order.order_items = itemsMap[order.id] || [];
        }
      }

      setOrders(rows);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    }
    setLoading(false);
  }, [outletFilter, supabase]);

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

  // Fetch OTP setting
  useEffect(() => {
    async function fetchOtpSetting() {
      const { data } = await supabase
        .from("app_settings" as never)
        .select("value")
        .eq("key" as never, "pickup_otp_required")
        .single();
      const row = data as { value: string } | null;
      if (row) {
        setOtpRequired(row.value === "true");
      }
    }
    fetchOtpSetting();
  }, [supabase]);

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      const { error } = await supabase.rpc("update_order_status" as never, {
        p_order_id: orderId,
        p_status: newStatus,
      } as never);
      if (error) throw error;
      // Realtime will trigger a refresh, but also update locally.
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
      toast.success(`Order moved to ${ORDER_STATUS_LABELS[newStatus] ?? newStatus}`);
    } catch (err) {
      console.error("Order status update failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update order status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleManualRefund = async (orderId: string) => {
    if (!confirm("Refund wallet amount for this cancelled order?")) return;
    setRefundingId(orderId);
    try {
      const { data, error } = await supabase.rpc("manual_refund_order" as never, {
        p_order_id: orderId,
      } as never);

      if (error) {
        toast.error(error.message);
        setRefundingId(null);
        return;
      }

      const result = data as { refunded: number } | null;
      toast.success(`Refunded ₹${result?.refunded ?? 0} to customer wallet.`);

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, payment_status: "refunded" } : o
        )
      );
    } catch (err) {
      console.error("Refund failed:", err);
      toast.error("Refund failed. Please try again.");
    }
    setRefundingId(null);
  };

  const handleRejectWithRefund = async (orderId: string) => {
    setUpdatingId(orderId);
    try {
      const { data, error } = await supabase.rpc("reject_and_refund_order" as never, {
        p_order_id: orderId,
      } as never);

      if (error) {
        toast.error(error.message);
        setUpdatingId(null);
        return;
      }

      const result = data as { wallet_refunded: number; online_amount: number; payment_method: string } | null;

      if (result && result.wallet_refunded > 0) {
        toast.success(`Order rejected. ₹${result.wallet_refunded} refunded to wallet.${result.online_amount > 0 ? ` ₹${result.online_amount} online payment needs manual processing.` : ""}`, { duration: 6000 });
      } else if (result && result.online_amount > 0) {
        toast.success(`Order rejected. ₹${result.online_amount} online payment needs manual processing.`, { duration: 6000 });
      } else {
        toast.success("Order rejected and refund processed.");
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: "rejected" as OrderStatus, payment_status: "refunded" } : o
        )
      );
    } catch (err) {
      console.error("Reject+refund failed:", err);
      toast.error("Failed to reject order. Please try again.");
    }
    setUpdatingId(null);
  };

  const handlePickupClick = (order: OrderWithProfile) => {
    if (otpRequired) {
      setOtpModalOrder(order);
      setOtpInput("");
      setOtpError(false);
    } else {
      completeOrderWithPickupCode(order, order.delivery_code ?? generatePickupCode(order.order_number));
    }
  };

  const completeOrderWithPickupCode = async (order: OrderWithProfile, code: string) => {
    setUpdatingId(order.id);
    try {
      const { error } = await supabase.rpc("complete_order_with_pickup_code" as never, {
        p_order_id: order.id,
        p_code: code,
      } as never);
      if (error) throw error;
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: "picked_up" as OrderStatus } : o))
      );
      setOtpModalOrder(null);
      setOtpInput("");
      setOtpError(false);
      toast.success("Order completed successfully");
    } catch (err) {
      console.error("Pickup completion failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to complete pickup.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOtpVerify = () => {
    if (!otpModalOrder) return;
    const expectedCode = otpModalOrder.delivery_code ?? generatePickupCode(otpModalOrder.order_number);
    if (otpInput === expectedCode) {
      setOtpError(false);
      completeOrderWithPickupCode(otpModalOrder, otpInput);
    } else {
      setOtpError(true);
    }
  };

  const toggleOtpSetting = async () => {
    const newValue = !otpRequired;
    try {
      const { error } = await supabase.rpc("set_pickup_otp_required" as never, {
        p_required: newValue,
      } as never);
      if (error) throw error;
      setOtpRequired(newValue);
      toast.success(`Pickup OTP ${newValue ? "enabled" : "disabled"}`);
    } catch (err) {
      console.error("OTP setting update failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update OTP setting.");
    }
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
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-brand-gray-600 cursor-pointer">
            <KeyRound className="w-4 h-4" />
            <span className="font-medium">OTP on Pickup</span>
            <button
              onClick={toggleOtpSetting}
              className={cn(
                "relative w-9 h-5 rounded-full transition-colors",
                otpRequired ? "bg-brand-green" : "bg-brand-gray-300"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                  otpRequired && "translate-x-4"
                )}
              />
            </button>
          </label>
          <button
            onClick={fetchOrders}
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-gray-600 hover:text-brand-black transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
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

                {/* Order Items with Customizations */}
                {order.order_items && order.order_items.length > 0 && (
                  <div className="space-y-2 border-t border-brand-gray-100 pt-3">
                    {order.order_items.map((item) => {
                      const customizations = (Array.isArray(item.customizations) ? item.customizations : []) as {
                        group_name: string;
                        options: { name: string; price: number }[];
                      }[];
                      return (
                        <div key={item.id}>
                          <div className="flex justify-between text-sm">
                            <span className="text-brand-gray-700">
                              <span className="font-semibold text-brand-black">{item.quantity}x</span>{" "}
                              {item.item_name}
                            </span>
                            <span className="text-brand-gray-500 shrink-0 ml-2">
                              {formatCurrency(item.total_price)}
                            </span>
                          </div>
                          {customizations.length > 0 && (
                            <div className="ml-6 mt-0.5 space-y-0.5">
                              {customizations.map((group) => (
                                <p key={group.group_name} className="text-xs text-brand-gray-500">
                                  <span className="font-medium text-brand-gray-600">{group.group_name}:</span>{" "}
                                  {group.options.map((opt) => opt.name + (opt.price > 0 ? ` (+${formatCurrency(opt.price)})` : "")).join(", ")}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Accept/Reject for pending orders */}
                {order.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      disabled={updatingId === order.id}
                      onClick={() => updateStatus(order.id, "confirmed")}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold font-[family-name:var(--font-heading)] transition-colors bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {updatingId === order.id ? (
                        <Spinner size="sm" className="text-white" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Accept
                    </button>
                    <button
                      disabled={updatingId === order.id}
                      onClick={() => handleRejectWithRefund(order.id)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold font-[family-name:var(--font-heading)] transition-colors bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      {updatingId === order.id ? (
                        <Spinner size="sm" className="text-white" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                      Reject
                    </button>
                  </div>
                )}

                {/* Action for non-pending orders */}
                {nextStatus && nextStatus !== "picked_up" && (
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

                {/* Pickup button with optional OTP */}
                {order.status === "ready" && (
                  <button
                    disabled={updatingId === order.id}
                    onClick={() => handlePickupClick(order)}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold font-[family-name:var(--font-heading)] transition-colors",
                      "bg-brand-green text-white hover:bg-brand-green-dark disabled:opacity-50"
                    )}
                  >
                    {updatingId === order.id ? (
                      <Spinner size="sm" className="text-white" />
                    ) : otpRequired ? (
                      <KeyRound className="w-4 h-4" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    {otpRequired ? "Verify & Pickup" : "Mark as Picked Up"}
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

                {order.status === "rejected" &&
                  order.payment_status !== "refunded" && (
                    <button
                      disabled={refundingId === order.id}
                      onClick={() => handleRejectWithRefund(order.id)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold font-[family-name:var(--font-heading)] transition-colors bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                    >
                      {refundingId === order.id ? (
                        <Spinner size="sm" className="text-white" />
                      ) : (
                        <Undo2 className="w-4 h-4" />
                      )}
                      Process Refund {formatCurrency(order.total)}
                    </button>
                  )}

                {order.status === "rejected" &&
                  order.payment_status === "refunded" && (
                    <div className="w-full text-center py-2.5 rounded-xl text-sm font-semibold bg-green-50 text-green-700 border border-green-200">
                      Refunded
                      {order.wallet_used > 0 && (
                        <span className="block text-xs font-normal text-green-600 mt-0.5">
                          {formatCurrency(order.wallet_used)} returned to wallet
                          {order.total - order.wallet_used > 0 && (
                            <> &middot; {formatCurrency(order.total - order.wallet_used)} via {order.payment_method === "split" ? "online" : order.payment_method}</>
                          )}
                        </span>
                      )}
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      )}

      {/* OTP Verification Modal */}
      <Modal
        open={!!otpModalOrder}
        onClose={() => setOtpModalOrder(null)}
        title="Verify Pickup OTP"
        className="max-w-sm"
      >
        {otpModalOrder && (
          <div className="flex flex-col items-center gap-4 py-2">
            <p className="text-sm text-brand-gray-600 text-center">
              Enter the 4-digit pickup code shown to customer for order{" "}
              <strong>#{otpModalOrder.order_number}</strong>
            </p>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={otpInput}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/\D/g, "").slice(0, 4);
                setOtpInput(cleaned);
                if (otpError) setOtpError(false);
              }}
              placeholder="0000"
              className={cn(
                "w-40 text-center text-3xl font-bold tracking-[0.4em] py-3 px-4 border-2 rounded-xl outline-none transition-colors",
                otpError
                  ? "border-red-500 bg-red-50 text-red-600"
                  : "border-brand-gray-300 focus:border-brand-green bg-white text-brand-black"
              )}
            />

            {otpError && (
              <p className="text-sm text-red-600 font-medium">
                Code does not match. Please try again.
              </p>
            )}

            <div className="flex items-center gap-3 w-full">
              <button
                onClick={handleOtpVerify}
                disabled={otpInput.length < 4}
                className="w-full py-2.5 rounded-xl bg-brand-green text-white font-semibold text-sm hover:bg-brand-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Verify & Pickup
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
