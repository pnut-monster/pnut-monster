"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  CreditCard,
  Wallet,
  ShoppingBag,
  Star,
} from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { useCartStore } from "@/lib/stores/cart-store";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { useAuth } from "@/lib/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/helpers";
import type { Outlet, Wallet as WalletType } from "@/lib/supabase/types";
import type { Json } from "@/lib/supabase/types";
import toast from "react-hot-toast";

type PaymentMethod = "online" | "wallet" | "split";
type RewardOption = "coupon" | "loyalty";

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color: string };
  modal?: { ondismiss: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: { error: { description: string } }) => void) => void;
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

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
    setOutlet: setCartOutlet,
  } = useCartStore();

  const { selectedOutlet, setOutlet: setSelectedOutlet } = useOutletStore();

  const [walletData, setWalletData] = useState<WalletType | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [useWallet, setUseWallet] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [taxRate, setTaxRate] = useState(0.05);
  const [packagingCharge, setPackagingCharge] = useState(10);
  const [packagingMode, setPackagingMode] = useState<"per_order" | "per_item">("per_order");

  // Loyalty points redemption
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [loyaltyEligible, setLoyaltyEligible] = useState(false);
  const [loyaltyMaxPoints, setLoyaltyMaxPoints] = useState(0);
  const [loyaltyMonetaryValue, setLoyaltyMonetaryValue] = useState(0);
  const [loyaltyPointValue, setLoyaltyPointValue] = useState(0.25);
  const [loyaltyUserBalance, setLoyaltyUserBalance] = useState(0);
  const [loyaltyReason, setLoyaltyReason] = useState("");
  const [rewardOption, setRewardOption] = useState<RewardOption>("coupon");

  // Nth order discount
  const [nthOrderEligible, setNthOrderEligible] = useState(false);
  const [nthOrderDiscountPct, setNthOrderDiscountPct] = useState(0);
  const [nthOrderStackWithLoyalty, setNthOrderStackWithLoyalty] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      const supabase = createClient();
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["tax_rate", "packaging_charge", "packaging_mode"]);
      if (data) {
        for (const row of data as { key: string; value: string }[]) {
          if (row.key === "tax_rate") setTaxRate(parseFloat(row.value));
          if (row.key === "packaging_charge") setPackagingCharge(parseFloat(row.value));
          if (row.key === "packaging_mode") setPackagingMode(row.value as "per_order" | "per_item");
        }
      }
    }
    loadSettings();
  }, []);

  // Fetch nth-order discount eligibility
  useEffect(() => {
    async function fetchNthOrderDiscount() {
      if (!user) return;
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc("check_nth_order_discount" as never, {
          p_user_id: user.id,
        } as never);
        const result = data as { eligible: boolean; discount_pct: number; stack_with_loyalty: boolean } | null;
        if (result) {
          setNthOrderEligible(result.eligible);
          setNthOrderDiscountPct(result.discount_pct);
          setNthOrderStackWithLoyalty(result.stack_with_loyalty);
        }
      } catch {
        setNthOrderEligible(false);
      }
    }
    if (!authLoading) fetchNthOrderDiscount();
  }, [user, authLoading]);

  const subtotal = getSubtotal();
  const hasCouponDiscount = !!coupon_code && coupon_discount > 0;
  const loyaltySelected = useLoyalty && rewardOption === "loyalty";
  const couponSelected = hasCouponDiscount && !loyaltySelected;
  const discount = couponSelected ? coupon_discount : 0;
  // Nth order discount: only applies when no coupon is used
  const nthOrderDiscountAmount = (nthOrderEligible && discount === 0)
    ? Math.round(subtotal * nthOrderDiscountPct / 100 * 100) / 100
    : 0;
  const totalDiscount = discount + nthOrderDiscountAmount;
  const taxableAmount = subtotal - totalDiscount;
  const tax = Math.round(taxableAmount * taxRate * 100) / 100;
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const packaging = items.length > 0
    ? (packagingMode === "per_item" ? packagingCharge * itemCount : packagingCharge)
    : 0;
  const total = taxableAmount + tax + packaging;

  // Loyalty: only stacks if admin allows it
  const loyaltyDiscount = (loyaltySelected && (nthOrderDiscountAmount === 0 || nthOrderStackWithLoyalty))
    ? loyaltyMonetaryValue
    : 0;
  const totalAfterLoyalty = total - loyaltyDiscount;

  const walletBalance = walletData
    ? walletData.loaded_balance + walletData.bonus_balance
    : 0;

  const walletApplied = useWallet ? Math.min(walletBalance, totalAfterLoyalty) : 0;
  const amountDue = totalAfterLoyalty - walletApplied;
  const paymentMethod: PaymentMethod =
    useWallet && walletApplied >= totalAfterLoyalty
      ? "wallet"
      : useWallet && walletApplied > 0
        ? "split"
        : "online";

  // Fetch loyalty eligibility
  useEffect(() => {
    async function fetchLoyaltyEligibility() {
      if (!user || items.length === 0) return;
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc("calculate_max_redeemable_points" as never, {
          p_user_id: user.id,
          p_subtotal: subtotal,
          p_tax: tax,
          p_packaging: packaging,
          p_has_coupon: false,
          p_has_discounted_items: false,
        } as never);

        const result = data as { eligible: boolean; max_points: number; monetary_value: number; point_value: number; user_balance: number; reason?: string } | null;
        if (result) {
          setLoyaltyEligible(result.eligible);
          setLoyaltyMaxPoints(result.max_points);
          setLoyaltyMonetaryValue(result.monetary_value);
          setLoyaltyPointValue(result.point_value ?? 0.25);
          setLoyaltyUserBalance(result.user_balance ?? 0);
          setLoyaltyReason(result.reason ?? "");
          if (!result.eligible) setUseLoyalty(false);
        }
      } catch {
        setLoyaltyEligible(false);
      }
    }
    if (!authLoading) fetchLoyaltyEligibility();
  }, [user, authLoading, subtotal, tax, packaging, items.length]);

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

  const loadRazorpayScript = () =>
    new Promise<void>((resolve, reject) => {
      if (window.Razorpay) {
        resolve();
        return;
      }

      const existingScript = document.getElementById("razorpay-script") as
        | HTMLScriptElement
        | null;
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Could not load payment gateway")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = "razorpay-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load payment gateway"));
      document.body.appendChild(script);
    });

  const resolveOutlet = async () => {
    const supabase = createClient();
    let resolvedOutletId = outlet_id || "";
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    let outletExists = false;
    if (outlet_id && uuidPattern.test(outlet_id)) {
      const { data: outlet } = await supabase
        .from("outlets")
        .select("id")
        .eq("id", outlet_id)
        .maybeSingle();
      outletExists = !!outlet;
    }

    if (!outletExists && selectedOutlet?.slug) {
      const { data: refreshedOutlet } = await supabase
        .from("outlets")
        .select("*")
        .eq("slug", selectedOutlet.slug)
        .eq("is_active", true)
        .maybeSingle();

      const outlet = refreshedOutlet as Outlet | null;
      if (outlet) {
        resolvedOutletId = outlet.id;
        setCartOutlet(outlet.id);
        setSelectedOutlet(outlet);
        outletExists = true;
      }
    }

    return { resolvedOutletId, outletExists };
  };

  const buildOrderPayload = (resolvedOutletId: string) => {
    const effectiveUserId = user?.id ?? "";
    const orderData: Json = {
      user_id: effectiveUserId,
      outlet_id: resolvedOutletId,
      subtotal: subtotal,
      tax: tax,
      packaging_charge: packaging,
      discount: discount,
      wallet_used: walletApplied,
      total: total,
      payment_method: paymentMethod,
      payment_status: "paid" as const,
      coupon_code: couponSelected ? coupon_code : null,
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

    return { orderData, orderItems };
  };

  const placeOrderDirect = async (resolvedOutletId: string) => {
    const supabase = createClient();
    const { orderData, orderItems } = buildOrderPayload(resolvedOutletId);
    const loyaltyPointsToRedeem = loyaltySelected ? loyaltyMaxPoints : 0;

    const { data, error } = await supabase.rpc("place_order_with_wallet" as never, {
      p_order: orderData,
      p_items: orderItems,
      p_wallet_amount: walletApplied,
      p_loyalty_points: loyaltyPointsToRedeem,
      p_nth_order_discount: nthOrderDiscountAmount,
    } as never);

    const result = data as { order_id: string } | null;

    if (error) {
      throw new Error(error.message || "Failed to place order");
    }
    if (!result || !result.order_id) {
      throw new Error("Failed to place order");
    }

    return result.order_id;
  };

  const initiateRazorpayPayment = async (resolvedOutletId: string) => {
    await loadRazorpayScript();

    const supabaseForToken = createClient();
    const { data: { session: currentSession } } = await supabaseForToken.auth.getSession();
    if (!currentSession?.access_token) {
      throw new Error("Session expired. Please log in again.");
    }
    const capturedAccessToken = currentSession.access_token;
    const { orderData, orderItems } = buildOrderPayload(resolvedOutletId);

    const res = await fetch("/api/razorpay/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountDue,
        currency: "INR",
        receipt: `pnut_${Date.now()}`,
        orderData,
        orderItems,
        walletAmount: walletApplied,
        loyaltyPoints: loyaltySelected ? loyaltyMaxPoints : 0,
        nthOrderDiscount: nthOrderDiscountAmount,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create payment order");
    }

    const razorpayOrder = await res.json();
    const options: RazorpayOptions = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      name: "PNUT Monster",
      description: `Order payment`,
      order_id: razorpayOrder.id,
      handler: async (response: RazorpayResponse) => {
        try {

          const verifyRes = await fetch("/api/razorpay/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              orderData: {
                ...orderData,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
              },
              orderItems,
              walletAmount: walletApplied,
              loyaltyPoints: loyaltySelected ? loyaltyMaxPoints : 0,
              nthOrderDiscount: nthOrderDiscountAmount,
              accessToken: capturedAccessToken,
            }),
          });

          if (!verifyRes.ok) {
            const err = await verifyRes.json();
            toast.error(err.error || "Payment verification failed");
            setPlacing(false);
            return;
          }

          const { order_id } = await verifyRes.json();
          clearCart();
          toast.success("Payment successful! Order placed.");
          router.push(`/orders/${order_id}/confirmation`);
        } catch {
          toast.error("Payment verification failed. Please contact support.");
          setPlacing(false);
        }
      },
      prefill: {
        name: user?.user_metadata?.full_name || "",
        email: user?.email || "",
        contact: user?.user_metadata?.phone || "",
      },
      theme: { color: "#F59E0B" },
      modal: {
        ondismiss: () => {
          setPlacing(false);
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on("payment.failed", (response: { error: { description: string } }) => {
      toast.error(response.error.description || "Payment failed");
      setPlacing(false);
    });
    rzp.open();
  };

  const handlePlaceOrder = async () => {
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
      const { resolvedOutletId, outletExists } = await resolveOutlet();

      if (!outletExists) {
        toast.error("Please select an outlet first");
        router.push("/outlets");
        setPlacing(false);
        return;
      }

      if (amountDue <= 0) {
        const orderId = await placeOrderDirect(resolvedOutletId);
        clearCart();
        toast.success("Order placed successfully!");
        router.push(`/orders/${orderId}/confirmation`);
      } else {
        await initiateRazorpayPayment(resolvedOutletId);
      }
    } catch (err) {
      console.error("Place order error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to place order. Please try again.");
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

        {/* Loyalty Points */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-brand-yellow-dark" />
            <h3 className="font-semibold text-brand-black text-sm">
              Rewards
            </h3>
          </div>

          {hasCouponDiscount && (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-brand-gray-200 px-3 py-2.5 mb-3 cursor-pointer hover:bg-brand-gray-50 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand-black">
                  Use Coupon Discount
                </p>
                <p className="text-xs text-brand-green-dark">
                  {coupon_code} saves {formatCurrency(coupon_discount)}
                </p>
              </div>
              <input
                type="radio"
                name="reward"
                checked={couponSelected}
                onChange={() => {
                  setRewardOption("coupon");
                  setUseLoyalty(false);
                }}
                className="w-4 h-4 text-brand-yellow accent-yellow-500"
              />
            </label>
          )}

          {loyaltyEligible && !(nthOrderDiscountAmount > 0 && !nthOrderStackWithLoyalty) ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-brand-gray-600">
                  Balance:{" "}
                  <span className="font-bold text-brand-black">
                    {loyaltyUserBalance.toLocaleString("en-IN")} pts
                  </span>
                  <span className="text-xs text-brand-gray-400 ml-1">
                    (₹{(loyaltyUserBalance * loyaltyPointValue).toFixed(0)} value)
                  </span>
                </span>
                {hasCouponDiscount ? (
                  <input
                    type="radio"
                    name="reward"
                    checked={loyaltySelected}
                    onChange={() => {
                      setUseLoyalty(true);
                      setRewardOption("loyalty");
                    }}
                    className="w-4 h-4 text-brand-yellow accent-yellow-500"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !loyaltySelected;
                      setUseLoyalty(next);
                      setRewardOption(next ? "loyalty" : "coupon");
                    }}
                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                      loyaltySelected ? "bg-brand-yellow" : "bg-brand-gray-200"
                    }`}
                    aria-pressed={loyaltySelected}
                    role="switch"
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        loyaltySelected ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                )}
              </div>
              {loyaltySelected && (
                <div className="text-xs text-brand-green-dark bg-green-50 rounded-lg px-3 py-2">
                  {loyaltyMaxPoints.toLocaleString("en-IN")} points ({formatCurrency(loyaltyMonetaryValue)}) will be applied as discount
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-brand-gray-400">
              {nthOrderDiscountAmount > 0 && !nthOrderStackWithLoyalty
                ? "Cannot use points with 5th-order discount"
                : loyaltyReason || "Not eligible for point redemption on this order"}
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
                {formatCurrency(totalAfterLoyalty)}
              </span>
            </label>

            {walletBalance >= totalAfterLoyalty && totalAfterLoyalty > 0 && (
              <label className="flex items-center gap-3 p-3 rounded-xl border border-brand-gray-200 cursor-pointer hover:bg-brand-gray-50 transition-colors">
                <input
                  type="radio"
                  name="payment"
                value="wallet"
                checked={paymentMethod === "wallet"}
                onChange={() => {
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
                  {formatCurrency(totalAfterLoyalty)}
                </span>
              </label>
            )}

            {walletBalance > 0 && walletBalance < totalAfterLoyalty && (
              <label className="flex items-center gap-3 p-3 rounded-xl border border-brand-gray-200 cursor-pointer hover:bg-brand-gray-50 transition-colors">
                <input
                  type="radio"
                  name="payment"
                value="split"
                checked={paymentMethod === "split"}
                onChange={() => {
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
                    {formatCurrency(totalAfterLoyalty - walletBalance)} online
                  </p>
                </div>
              </label>
            )}

            {amountDue > 0 && paymentMethod !== "online" && (
              <div className="rounded-xl border border-brand-gray-200 bg-brand-gray-50 px-3 py-2 text-xs font-medium text-brand-gray-600">
                Remaining {formatCurrency(amountDue)} will be paid via Razorpay (UPI, Cards, Net Banking)
              </div>
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
                <span>Coupon Discount</span>
                <span>-{formatCurrency(discount)}</span>
              </div>
            )}
            {nthOrderDiscountAmount > 0 && (
              <div className="flex justify-between text-brand-green-dark">
                <span>5th Order Discount ({nthOrderDiscountPct}%)</span>
                <span>-{formatCurrency(nthOrderDiscountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-brand-gray-600">
              <span>Tax ({Math.round(taxRate * 100 * 10) / 10}%)</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between text-brand-gray-600">
              <span>Packaging</span>
              <span>{formatCurrency(packaging)}</span>
            </div>
            {loyaltyDiscount > 0 && (
              <div className="flex justify-between text-brand-green-dark">
                <span>Loyalty Points</span>
                <span>-{formatCurrency(loyaltyDiscount)}</span>
              </div>
            )}
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
          disabled={placing}
          onClick={handlePlaceOrder}
        >
          {placing
            ? "Placing Order..."
            : amountDue > 0
              ? `Pay ${formatCurrency(amountDue)} & Place Order`
              : "Place Order"}
        </Button>
      </div>
    </div>
  );
}
