"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Minus,
  Plus,
  Trash2,
  Tag,
  ShoppingBag,
} from "lucide-react";
import { Button, Card, Input, EmptyState } from "@/components/ui";
import { useCartStore } from "@/lib/stores/cart-store";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/helpers";
import { TAX_RATE, PACKAGING_CHARGE } from "@/lib/utils/constants";
import type { Coupon } from "@/lib/supabase/types";
import toast from "react-hot-toast";


export default function CartPage() {
  const router = useRouter();
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
    getItemCount,
  } = useCartStore();

  const { selectedOutlet } = useOutletStore();

  const [couponInput, setCouponInput] = useState(coupon_code ?? "");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const subtotal = getSubtotal();
  const discount = coupon_discount;
  const taxableAmount = subtotal - discount;
  const tax = Math.round(taxableAmount * TAX_RATE * 100) / 100;
  const packaging = items.length > 0 ? PACKAGING_CHARGE : 0;
  const total = taxableAmount + tax + packaging;

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setCouponError("Enter a coupon code");
      return;
    }

    setCouponLoading(true);
    setCouponError(null);

    let coupon: Coupon | null = null;

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", code)
        .eq("is_active", true)
        .single();

      if (error || !data) {
        coupon = null;
      } else {
        coupon = data as Coupon;
      }
    } catch (err) {
      console.error("Failed to validate coupon:", err);
      coupon = null;
    }

    if (!coupon) {
      setCouponError("Invalid coupon code");
      setCoupon(null, 0);
      setCouponLoading(false);
      return;
    }

    const now = new Date().toISOString();
    if (now < coupon.starts_at || now > coupon.ends_at) {
      setCouponError("This coupon has expired");
      setCoupon(null, 0);
      setCouponLoading(false);
      return;
    }

    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      setCouponError("This coupon has reached its usage limit");
      setCoupon(null, 0);
      setCouponLoading(false);
      return;
    }

    if (subtotal < coupon.min_order) {
      setCouponError(
        `Minimum order of ${formatCurrency(coupon.min_order)} required`
      );
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
      <div className="min-h-screen bg-brand-cream">
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
            Your Cart
          </h1>
          <span className="ml-auto text-sm text-brand-gray-500">
            {getItemCount()} {getItemCount() === 1 ? "item" : "items"}
          </span>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Outlet info */}
        {selectedOutlet && (
          <div className="text-sm text-brand-gray-600">
            Ordering from{" "}
            <span className="font-semibold text-brand-black">
              {selectedOutlet.name}
            </span>
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
                onClick={handleApplyCoupon}
                className="shrink-0 self-start mt-0"
              >
                Apply
              </Button>
            </div>
          )}
        </Card>

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
              <span>Tax (5%)</span>
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
