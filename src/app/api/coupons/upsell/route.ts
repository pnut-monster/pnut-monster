import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Coupon } from "@/lib/supabase/types";

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

type CartItemInput = {
  item_id: string;
  quantity: number;
};

type UpsellRequest = {
  subtotal?: number;
  outlet_id?: string | null;
  items?: CartItemInput[];
  applied_coupon_code?: string | null;
};

export type UpsellCoupon = {
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  max_discount: number | null;
  min_order_required: number;
  amount_to_add: number;
  potential_savings: number;
};

type UsageRow = {
  coupon_id: string;
  user_id: string;
  created_at: string;
};

function countByCoupon(rows: UsageRow[], predicate: (row: UsageRow) => boolean) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (!predicate(row)) continue;
    counts[row.coupon_id] = (counts[row.coupon_id] ?? 0) + 1;
  }
  return counts;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as UpsellRequest;
  const subtotal = Number(body.subtotal ?? 0);
  const outletId = body.outlet_id ?? null;
  const items = (body.items ?? []).filter((item) => item.item_id && item.quantity > 0);
  const appliedCode = body.applied_coupon_code?.trim().toUpperCase() ?? null;

  if (subtotal <= 0) {
    return NextResponse.json({ upsell_coupons: [] });
  }

  const supabase = await createClient("sb-customer-auth-token");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ upsell_coupons: [] });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: couponData, error: couponError } = await admin
    .from("coupons")
    .select("*")
    .eq("is_active", true)
    .or("status.is.null,status.eq.active")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("priority" as never, { ascending: false })
    .order("created_at", { ascending: false });

  if (couponError || !couponData) {
    return NextResponse.json({ upsell_coupons: [] });
  }

  const coupons = couponData as ExtendedCoupon[];
  if (coupons.length === 0) {
    return NextResponse.json({ upsell_coupons: [] });
  }

  const couponIds = coupons.map((c) => c.id);
  const itemIds = new Set(items.map((item) => item.item_id));

  const [restrictionsResult, usageResult, orderCountResult, membershipResult] =
    await Promise.all([
      admin
        .from("coupon_outlet_restrictions" as never)
        .select("coupon_id, outlet_id")
        .in("coupon_id" as never, couponIds as never),
      admin
        .from("coupon_usage")
        .select("coupon_id, user_id, created_at")
        .in("coupon_id", couponIds),
      admin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      admin.rpc("get_membership_status" as never, { p_user_id: user.id } as never),
    ]);

  const restrictions: Record<string, string[]> = {};
  for (const row of (restrictionsResult.data ?? []) as unknown as {
    coupon_id: string;
    outlet_id: string;
  }[]) {
    restrictions[row.coupon_id] = [
      ...(restrictions[row.coupon_id] ?? []),
      row.outlet_id,
    ];
  }

  const usageRows = (usageResult.data ?? []) as UsageRow[];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();
  const userUsageCounts = countByCoupon(usageRows, (row) => row.user_id === user.id);
  const dailyUsageCounts = countByCoupon(usageRows, (row) => row.created_at >= todayStartIso);
  const orderCount = orderCountResult.count ?? 0;
  const membershipData = membershipResult.data as { current_tier?: string } | null;
  const membershipTier = membershipData?.current_tier ?? null;

  const maxAddMore = subtotal * 2;
  const upsellCoupons: UpsellCoupon[] = [];

  for (const coupon of coupons) {
    if (appliedCode && coupon.code === appliedCode) continue;

    const minCartValue = Math.max(coupon.min_order ?? 0, coupon.min_cart_value ?? 0);
    if (minCartValue <= subtotal) continue;

    const amountToAdd = minCartValue - subtotal;
    if (amountToAdd > maxAddMore || amountToAdd <= 0) continue;

    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) continue;
    if (coupon.per_user_limit && (userUsageCounts[coupon.id] ?? 0) >= coupon.per_user_limit) continue;
    if (coupon.daily_limit && (dailyUsageCounts[coupon.id] ?? 0) >= coupon.daily_limit) continue;

    const restrictedOutlets = restrictions[coupon.id] ?? [];
    if (restrictedOutlets.length > 0 && (!outletId || !restrictedOutlets.includes(outletId))) continue;

    const eligibility = coupon.customer_eligibility ?? "all";
    if (eligibility === "new" && orderCount !== 0) continue;
    if (eligibility === "existing" && orderCount === 0) continue;
    if (eligibility === "premium" && membershipTier !== "sprout_hero" && membershipTier !== "pnut_legend") continue;
    if (eligibility === "student") {
      const meta = user.user_metadata ?? {};
      if (meta.is_student !== true && meta.customer_eligibility !== "student") continue;
    }

    const discountType = coupon.discount_type_ext ?? coupon.discount_type;
    if (discountType === "buy_x_get_y" || discountType === "free_product") continue;

    const applicableType = coupon.applicable_type ?? "all";
    if (applicableType === "products") {
      const productIds = coupon.applicable_product_ids ?? [];
      if (productIds.length > 0 && !productIds.some((id) => itemIds.has(id))) continue;
    }

    let potentialSavings = 0;
    const targetCartValue = minCartValue;
    if (coupon.discount_type === "percentage") {
      potentialSavings = Math.round((targetCartValue * coupon.discount_value) / 100);
      if (coupon.max_discount) {
        potentialSavings = Math.min(potentialSavings, coupon.max_discount);
      }
    } else {
      potentialSavings = coupon.discount_value;
    }

    if (potentialSavings <= 0) continue;

    upsellCoupons.push({
      code: coupon.code,
      description: coupon.description,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      max_discount: coupon.max_discount,
      min_order_required: minCartValue,
      amount_to_add: Math.ceil(amountToAdd),
      potential_savings: potentialSavings,
    });
  }

  upsellCoupons.sort((a, b) => a.amount_to_add - b.amount_to_add);

  return NextResponse.json({ upsell_coupons: upsellCoupons.slice(0, 3) });
}
