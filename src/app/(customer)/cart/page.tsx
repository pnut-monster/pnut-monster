"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Minus,
  Plus,
  Trash2,
  Tag,
  ShoppingBag,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { Button, Card, Input, EmptyState } from "@/components/ui";
import { useCartStore } from "@/lib/stores/cart-store";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/helpers";
import type { Coupon } from "@/lib/supabase/types";
import type { UpsellCoupon } from "@/app/api/coupons/upsell/route";
import toast from "react-hot-toast";

type ExtendedCoupon = Coupon & {
  name?: string | null;
  discount_type_ext?: string | null;
  min_cart_value?: number | null;
  per_user_limit?: number | null;
  daily_limit?: number | null;
  priority?: number | null;
  status?: string | null;
  customer_eligibility?: string | null;
  buy_x_qty?: number | null;
  get_y_qty?: number | null;
  free_product_id?: string | null;
  applicable_type?: string | null;
  applicable_product_ids?: string[] | null;
  applicable_category_ids?: string[] | null;
};

export default function CartPage() {
  const router = useRouter();
  const couponRequestSeqRef = useRef(0);
  const {
    items,
    coupon_code,
    coupon_discount,
    notes,
    removeItem,
    updateQuantity,
    setCoupon,
    setNotes,
    getSubtotal,
  } = useCartStore();

  const { selectedOutlet } = useOutletStore();

  const [couponInput, setCouponInput] = useState(coupon_code ?? "");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [availableCoupons, setAvailableCoupons] = useState<ExtendedCoupon[]>([]);
  const [couponsLoaded, setCouponsLoaded] = useState(false);
  const [upsellCoupons, setUpsellCoupons] = useState<UpsellCoupon[]>([]);
  const [taxRate, setTaxRate] = useState(0.05);
  const [packagingCharge, setPackagingCharge] = useState(10);
  const [packagingMode, setPackagingMode] = useState<"per_order" | "per_item">("per_order");

  const subtotal = getSubtotal();
  const discount = coupon_discount;
  const taxableAmount = subtotal - discount;
  const tax = Math.round(taxableAmount * taxRate * 100) / 100;
  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );
  const couponItems = useMemo(
    () =>
      items.map((item) => ({
        item_id: item.item_id,
        quantity: item.quantity,
      })),
    [items]
  );
  const packaging = items.length > 0
    ? (packagingMode === "per_item" ? packagingCharge * itemCount : packagingCharge)
    : 0;
  const total = taxableAmount + tax + packaging;

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

  useEffect(() => {
    const requestSeq = couponRequestSeqRef.current + 1;
    couponRequestSeqRef.current = requestSeq;

    const timer = setTimeout(() => {
      async function loadCoupons() {
        setCouponsLoaded(false);
        try {
          const response = await fetch("/api/coupons/eligible", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subtotal,
              outlet_id: selectedOutlet?.id ?? null,
              items: couponItems,
            }),
          });

          if (couponRequestSeqRef.current !== requestSeq) return;
          if (!response.ok) {
            setAvailableCoupons([]);
            setCouponsLoaded(true);
            return;
          }

          const data = (await response.json()) as { coupons?: ExtendedCoupon[] };
          if (couponRequestSeqRef.current !== requestSeq) return;
          setAvailableCoupons(data.coupons ?? []);
        } catch (err) {
          if (couponRequestSeqRef.current !== requestSeq) return;
          console.error("Failed to load eligible coupons:", err);
          setAvailableCoupons([]);
        } finally {
          if (couponRequestSeqRef.current !== requestSeq) return;
          setCouponsLoaded(true);
        }
      }

      loadCoupons();
    }, 150);

    return () => clearTimeout(timer);
  }, [couponItems, selectedOutlet?.id, subtotal]);

  useEffect(() => {
    if (!couponsLoaded || !coupon_code) return;
    const stillEligible = availableCoupons.some((coupon) => coupon.code === coupon_code);
    if (!stillEligible) {
      setCoupon(null, 0);
      setCouponInput("");
      setCouponError(null);
    }
  }, [availableCoupons, coupon_code, couponsLoaded, setCoupon]);

  useEffect(() => {
    if (subtotal <= 0) {
      setUpsellCoupons([]);
      return;
    }

    const timer = setTimeout(() => {
      async function loadUpsell() {
        try {
          const response = await fetch("/api/coupons/upsell", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subtotal,
              outlet_id: selectedOutlet?.id ?? null,
              items: couponItems,
              applied_coupon_code: coupon_code ?? null,
            }),
          });
          if (!response.ok) {
            setUpsellCoupons([]);
            return;
          }
          const data = (await response.json()) as { upsell_coupons?: UpsellCoupon[] };
          setUpsellCoupons(data.upsell_coupons ?? []);
        } catch {
          setUpsellCoupons([]);
        }
      }
      loadUpsell();
    }, 300);

    return () => clearTimeout(timer);
  }, [subtotal, selectedOutlet?.id, couponItems, coupon_code]);

  const handleApplyCoupon = async (selectedCode?: string) => {
    const code = (selectedCode ?? couponInput).trim().toUpperCase();
    if (!code) {
      setCouponError("Enter a coupon code");
      return;
    }

    setCouponLoading(true);
    setCouponError(null);

    let coupon: ExtendedCoupon | null = null;

    try {
      const response = await fetch("/api/coupons/eligible", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          subtotal,
          outlet_id: selectedOutlet?.id ?? null,
          items: couponItems,
        }),
      });
      const data = response.ok
        ? ((await response.json()) as { coupons?: ExtendedCoupon[] })
        : { coupons: [] };
      coupon = data.coupons?.[0] ?? null;
    } catch (err) {
      console.error("Failed to validate coupon:", err);
      coupon = null;
    }

    if (!coupon) {
      setCouponError("Invalid coupon code or not eligible for this cart");
      setCoupon(null, 0);
      setCouponLoading(false);
      return;
    }

    let discountAmount = 0;
    if (coupon.discount_type === "percentage") {
      discountAmount = Math.round((subtotal * coupon.discount_value) / 100);
      if (coupon.max_discount) {
        discountAmount = Math.min(discountAmount, coupon.max_discount);
      }
    } else {
      discountAmount = coupon.discount_value;
    }

    discountAmount = Math.min(discountAmount, subtotal);

    setCouponInput(code);
    setCoupon(code, discountAmount);
    toast.success(`Coupon applied! You save ${formatCurrency(discountAmount)}`);
    setCouponLoading(false);
  };

  const handleRemoveCoupon = () => {
    setCoupon(null, 0);
    setCouponInput("");
    setCouponError(null);
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#FAFBFC]">
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
              Your Cart
            </h1>
          </div>
        </div>

        <EmptyState
          icon={<ShoppingBag className="h-16 w-16" />}
          title="Your cart is empty"
          description="Looks like you haven't added any items yet. Browse our menu and find something delicious!"
          action={
            <Button onClick={() => router.push("/menu")}>Browse Menu</Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFBFC] pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-brand-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 rounded-lg hover:bg-brand-gray-100 transition-colors"
          >
            <ChevronLeft className="h-6 w-6 text-brand-black" />
          </button>
          <div className="flex-1">
            <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider">CART</p>
            <h1 className="text-lg font-bold font-[family-name:var(--font-heading)] text-brand-black">
              Your Cart ({itemCount} {itemCount === 1 ? "item" : "items"})
            </h1>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Outlet info */}
        {selectedOutlet && (
          <div className="bg-white rounded-2xl p-4 border border-brand-gray-200">
            <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider mb-1">OUTLET</p>
            <p className="text-sm font-bold text-brand-black">{selectedOutlet.name}</p>
          </div>
        )}

        {/* Cart Items */}
        <Card className="divide-y divide-brand-gray-100">
          {items.map((item) => (
            <div key={item.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-brand-black text-sm">
                    {item.name}
                  </h3>
                  <p className="text-sm font-semibold text-brand-black mt-1">
                    {formatCurrency(item.total_price)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Quantity controls */}
                  <div className="flex items-center bg-brand-gray-50 rounded-xl border border-brand-gray-200">
                    <button
                      onClick={() =>
                        updateQuantity(item.id, item.quantity - 1)
                      }
                      className="p-1.5 hover:bg-brand-gray-100 rounded-l-xl transition-colors"
                    >
                      <Minus className="h-4 w-4 text-brand-black" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-brand-black">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() =>
                        updateQuantity(item.id, item.quantity + 1)
                      }
                      className="p-1.5 hover:bg-brand-gray-100 rounded-r-xl transition-colors"
                    >
                      <Plus className="h-4 w-4 text-brand-black" />
                    </button>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 text-brand-gray-400 hover:text-brand-red transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Customization details */}
              {item.customizations.length > 0 && (
                <div className="mt-2 ml-0.5 space-y-1.5">
                  {item.customizations.map((c) => (
                    <div key={c.group_id}>
                      <p className="text-[10px] font-bold text-brand-gray-400 uppercase tracking-wider">
                        {c.group_name}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-0.5">
                        {c.options.map((o) => (
                          <span
                            key={o.id}
                            className="inline-flex items-center gap-1 text-xs bg-brand-gray-50 text-brand-gray-700 px-2 py-0.5 rounded-md border border-brand-gray-200"
                          >
                            {o.name}
                            {o.price > 0 && (
                              <span className="text-brand-gray-400">
                                +{formatCurrency(o.price)}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Card>

        {/* Coupon Section */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-brand-yellow-dark" />
            <h3 className="font-semibold text-brand-black text-sm">
              Apply Coupon
            </h3>
          </div>

          {coupon_code ? (
            <div className="flex items-center justify-between bg-green-50 rounded-xl px-3 py-2.5">
              <div>
                <span className="text-sm font-bold text-brand-green-dark">
                  {coupon_code}
                </span>
                <span className="text-xs text-brand-gray-600 ml-2">
                  - {formatCurrency(coupon_discount)} off
                </span>
              </div>
              <button
                onClick={handleRemoveCoupon}
                className="text-xs font-semibold text-brand-red hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Enter coupon code"
                value={couponInput}
                onChange={(e) => {
                  setCouponInput(e.target.value.toUpperCase());
                  setCouponError(null);
                }}
                error={couponError ?? undefined}
                className="flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                loading={couponLoading}
                onClick={() => handleApplyCoupon()}
                className="shrink-0 self-start mt-0"
              >
                Apply
              </Button>
            </div>
          )}

          {availableCoupons.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider">
                Available Coupons
              </p>
              {availableCoupons.map((coupon) => (
                <div
                  key={coupon.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-brand-gray-200 bg-brand-gray-50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-brand-black">{coupon.code}</p>
                    <p className="text-xs text-brand-gray-600 truncate">{coupon.description}</p>
                    <p className="text-[11px] text-brand-gray-500">
                      Min order {formatCurrency(coupon.min_order)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={coupon_code === coupon.code ? "primary" : "outline"}
                    disabled={coupon_code === coupon.code}
                    onClick={() => handleApplyCoupon(coupon.code)}
                    className="shrink-0"
                  >
                    {coupon_code === coupon.code ? "Applied" : "Apply"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Upsell Nudge */}
        {upsellCoupons.length > 0 && (
          <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <h3 className="font-bold text-brand-black text-sm">Unlock bigger savings!</h3>
                <p className="text-[11px] text-brand-gray-500">Add a little more to your cart</p>
              </div>
            </div>
            <div className="space-y-2.5">
              {upsellCoupons.map((upsell) => (
                <div
                  key={upsell.code}
                  className="flex items-center gap-3 bg-white rounded-xl border border-orange-100 px-3 py-2.5 shadow-sm"
                >
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-orange-700">
                      Add {formatCurrency(upsell.amount_to_add)} more
                    </p>
                    <p className="text-[11px] text-brand-gray-600 truncate">
                      {upsell.discount_type === "percentage"
                        ? `Get ${upsell.discount_value}% off`
                        : `Get ${formatCurrency(upsell.discount_value)} off`}
                      {" "}with <span className="font-bold">{upsell.code}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold text-brand-green-dark">
                      Save {formatCurrency(upsell.potential_savings)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push("/menu")}
              className="mt-3 w-full text-center text-xs font-bold text-orange-700 hover:text-orange-900 transition-colors py-1.5"
            >
              Browse menu to add more →
            </button>
          </div>
        )}

        {/* Order Notes */}
        <Card>
          <h3 className="font-semibold text-brand-black text-sm mb-2">
            Special Instructions
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any special requests? (e.g., extra spicy, no onions)"
            rows={2}
            className="w-full rounded-xl border border-brand-gray-300 bg-white px-4 py-2.5 text-sm text-brand-black placeholder:text-brand-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow resize-none"
          />
        </Card>

        {/* Bill Summary */}
        <Card>
          <h3 className="font-semibold text-brand-black text-sm mb-3">
            Bill Summary
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
            <div className="flex justify-between text-brand-gray-600">
              <span>Tax ({Math.round(taxRate * 100 * 10) / 10}%)</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between text-brand-gray-600">
              <span>Packaging</span>
              <span>{formatCurrency(packaging)}</span>
            </div>
            <div className="border-t border-brand-gray-200 pt-2 flex justify-between font-bold text-brand-black">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-brand-gray-200 px-4 py-3 safe-bottom">
        <Button
          size="lg"
          className="w-full"
          onClick={() => router.push("/checkout")}
        >
          Proceed to Checkout &middot; {formatCurrency(total)}
        </Button>
      </div>
    </div>
  );
}
