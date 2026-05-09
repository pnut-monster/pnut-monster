"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  CreditCard,
  Wallet,
  ShoppingBag,
} from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { useCartStore } from "@/lib/stores/cart-store";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { useAuth } from "@/lib/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/helpers";
import { TAX_RATE, PACKAGING_CHARGE } from "@/lib/utils/constants";
import type { Wallet as WalletType } from "@/lib/supabase/types";
import type { Json } from "@/lib/supabase/types";
import toast from "react-hot-toast";

type PaymentMethod = "online" | "wallet" | "split";

export default function CheckoutPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    items,
    outlet_id,
    coupon_code,
    coupon_discount,
    notes,
    getSubtotal,
    getItemCount,
    clearCart,
  } = useCartStore();

  const { selectedOutlet } = useOutletStore();

  const [walletData, setWalletData] = useState<WalletType | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [useWallet, setUseWallet] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("online");
  const [placing, setPlacing] = useState(false);

  const subtotal = getSubtotal();
  const discount = coupon_discount;
  const taxableAmount = subtotal - discount;
  const tax = Math.round(taxableAmount * TAX_RATE * 100) / 100;
  const packaging = items.length > 0 ? PACKAGING_CHARGE : 0;
  const total = taxableAmount + tax + packaging;

  const walletBalance = walletData
    ? walletData.loaded_balance + walletData.bonus_balance
    : 0;

  const walletApplied = useWallet ? Math.min(walletBalance, total) : 0;
  const amountDue = total - walletApplied;

  // Fetch wallet balance
  useEffect(() => {
    async function fetchWallet() {
      if (!user) {
        setWalletLoading(false);
        return;
      }
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("wallets")
          .select("*")
          .eq("user_id", user.id)
          .single();

        const wallet = data as WalletType | null;
        setWalletData(wallet);
      } catch (err) {
        console.error("Failed to fetch wallet:", err);
      }
      setWalletLoading(false);
    }

    if (!authLoading) {
      fetchWallet();
    }
  }, [user, authLoading]);

  // Auto-select payment method based on wallet toggle
  useEffect(() => {
    if (useWallet && walletApplied >= total) {
      setPaymentMethod("wallet");
    } else if (useWallet && walletApplied > 0 && walletApplied < total) {
      setPaymentMethod("split");
    } else {
      setPaymentMethod("online");
    }
  }, [useWallet, walletApplied, total]);

  const handlePlaceOrder = async () => {
    const effectiveUserId = user?.id ?? "";

    if (!outlet_id) {
      toast.error("Please select an outlet first");
      return;
    }

    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    setPlacing(true);

    try {
      const supabase = createClient();

      const orderData: Json = {
        user_id: effectiveUserId,
        outlet_id: outlet_id,
        subtotal: subtotal,
        tax: tax,
        packaging_charge: packaging,
        discount: discount,
        wallet_used: walletApplied,
        total: total,
        payment_method: paymentMethod,
        payment_status: "paid" as const,
        coupon_code: coupon_code || null,
        notes: notes || null,
      };

      const orderItems: Json[] = items.map((item) => ({
        item_id: item.item_id,
        item_name: item.name,
        quantity: item.quantity,
        unit_price: item.base_price,
        total_price: item.total_price,
        customizations: item.customizations as unknown as Json,
      }));

      const { data, error } = await supabase.rpc("place_order_with_wallet" as never, {
        p_order: orderData,
        p_items: orderItems,
        p_wallet_amount: walletApplied,
      } as never);

      const result = data as { order_id: string } | null;

      if (error) {
        console.error("Order error:", error);
        toast.error(error.message || "Failed to place order. Please try again.");
        setPlacing(false);
        return;
      }

      if (!result || !result.order_id) {
        toast.error("Failed to place order. Please try again.");
        setPlacing(false);
        return;
      }

      clearCart();
      toast.success("Order placed successfully!");
      router.push(`/orders/${result.order_id}/confirmation`);
    } catch (err) {
      console.error("Place order error:", err);
      toast.error("Failed to place order. Please try again.");
      setPlacing(false);
    }
  };

  if (items.length === 0) {
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
              Checkout
            </h1>
          </div>
        </div>

        <EmptyState
          icon={<ShoppingBag className="h-16 w-16" />}
          title="Your cart is empty"
          description="Add items to your cart before checking out."
          action={
            <Button onClick={() => router.push("/menu")}>Browse Menu</Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-brand-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 rounded-lg hover:bg-brand-gray-100 transition-colors"
          >
            <ChevronLeft className="h-6 w-6 text-brand-black" />
          </button>
          <h1 className="text-xl font-bold font-[family-name:var(--font-heading)] text-brand-black">
            Checkout
          </h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Order Summary */}
        <Card>
          <h3 className="font-semibold text-brand-black text-sm mb-2">
            Order Summary
          </h3>
          <div className="space-y-1.5 text-sm text-brand-gray-600">
            {selectedOutlet && (
              <div className="flex justify-between">
                <span>Outlet</span>
                <span className="font-semibold text-brand-black">
                  {selectedOutlet.name}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Items</span>
              <span className="font-semibold text-brand-black">
                {getItemCount()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Total</span>
              <span className="font-bold text-brand-black">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </Card>

        {/* Wallet Section */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-4 w-4 text-brand-yellow-dark" />
            <h3 className="font-semibold text-brand-black text-sm">
              PNUT Wallet
            </h3>
          </div>

          {walletLoading ? (
            <div className="text-sm text-brand-gray-500">
              Loading wallet...
            </div>
          ) : walletData ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-brand-gray-600">
                  Balance:{" "}
                  <span className="font-bold text-brand-black">
                    {formatCurrency(walletBalance)}
                  </span>
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useWallet}
                    onChange={(e) => setUseWallet(e.target.checked)}
                    className="sr-only peer"
                    disabled={walletBalance <= 0}
                  />
                  <div className="w-10 h-5 bg-brand-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-yellow rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-yellow" />
                </label>
              </div>
              {useWallet && walletApplied > 0 && (
                <div className="text-xs text-brand-green-dark bg-green-50 rounded-lg px-3 py-2">
                  {formatCurrency(walletApplied)} will be deducted from wallet
                  {amountDue > 0 && (
                    <span>
                      {" "}
                      &middot; {formatCurrency(amountDue)} remaining via online
                      payment
                    </span>
                  )}
                </div>
              )}
              {walletBalance <= 0 && (
                <p className="text-xs text-brand-gray-400">
                  No balance available
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-brand-gray-500">
              No wallet found. Create one from your profile.
            </p>
          )}
        </Card>

        {/* Payment Method */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="h-4 w-4 text-brand-yellow-dark" />
            <h3 className="font-semibold text-brand-black text-sm">
              Payment Method
            </h3>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 rounded-xl border border-brand-gray-200 cursor-pointer hover:bg-brand-gray-50 transition-colors">
              <input
                type="radio"
                name="payment"
                value="online"
                checked={paymentMethod === "online" && !useWallet}
                onChange={() => {
                  setPaymentMethod("online");
                  setUseWallet(false);
                }}
                className="w-4 h-4 text-brand-yellow accent-yellow-500"
              />
              <div className="flex-1">
                <span className="text-sm font-semibold text-brand-black">
                  Pay Online
                </span>
                <p className="text-xs text-brand-gray-500">
                  UPI, Cards, Net Banking
                </p>
              </div>
              <span className="text-sm font-bold text-brand-black">
                {formatCurrency(total)}
              </span>
            </label>

            {walletBalance >= total && (
              <label className="flex items-center gap-3 p-3 rounded-xl border border-brand-gray-200 cursor-pointer hover:bg-brand-gray-50 transition-colors">
                <input
                  type="radio"
                  name="payment"
                  value="wallet"
                  checked={paymentMethod === "wallet"}
                  onChange={() => {
                    setPaymentMethod("wallet");
                    setUseWallet(true);
                  }}
                  className="w-4 h-4 text-brand-yellow accent-yellow-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-semibold text-brand-black">
                    Pay with Wallet
                  </span>
                  <p className="text-xs text-brand-gray-500">
                    Balance: {formatCurrency(walletBalance)}
                  </p>
                </div>
                <span className="text-sm font-bold text-brand-black">
                  {formatCurrency(total)}
                </span>
              </label>
            )}

            {walletBalance > 0 && walletBalance < total && (
              <label className="flex items-center gap-3 p-3 rounded-xl border border-brand-gray-200 cursor-pointer hover:bg-brand-gray-50 transition-colors">
                <input
                  type="radio"
                  name="payment"
                  value="split"
                  checked={paymentMethod === "split"}
                  onChange={() => {
                    setPaymentMethod("split");
                    setUseWallet(true);
                  }}
                  className="w-4 h-4 text-brand-yellow accent-yellow-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-semibold text-brand-black">
                    Split Payment
                  </span>
                  <p className="text-xs text-brand-gray-500">
                    {formatCurrency(walletBalance)} wallet +{" "}
                    {formatCurrency(total - walletBalance)} online
                  </p>
                </div>
              </label>
            )}
          </div>
        </Card>

        {/* Bill Breakdown */}
        <Card>
          <h3 className="font-semibold text-brand-black text-sm mb-3">
            Bill Details
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-brand-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-brand-green-dark">
                <span>Discount</span>
                <span>-{formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-brand-gray-600">
              <span>Tax (5%)</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between text-brand-gray-600">
              <span>Packaging</span>
              <span>{formatCurrency(packaging)}</span>
            </div>
            {walletApplied > 0 && (
              <div className="flex justify-between text-brand-green-dark">
                <span>Wallet</span>
                <span>-{formatCurrency(walletApplied)}</span>
              </div>
            )}
            <div className="border-t border-brand-gray-200 pt-2 flex justify-between font-bold text-brand-black">
              <span>Amount to Pay</span>
              <span>{formatCurrency(amountDue)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-brand-gray-200 px-4 py-3 safe-bottom">
        <Button
          size="lg"
          className="w-full"
          loading={placing}
          onClick={handlePlaceOrder}
        >
          {placing
            ? "Placing Order..."
            : `Place Order ${amountDue > 0 ? `\u00B7 Pay ${formatCurrency(amountDue)}` : ""}`}
        </Button>
      </div>
    </div>
  );
}
