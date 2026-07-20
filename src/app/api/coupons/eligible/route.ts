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

type EligibleCouponRequest = {
  code?: string;
  subtotal?: number;
  outlet_id?: string | null;
  items?: CartItemInput[];
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

function hasApplicableItems(
  coupon: ExtendedCoupon,
  itemIds: Set<string>,
  categoryIds: Set<string>
) {
  const applicableType = coupon.applicable_type ?? "all";
  if (applicableType === "all") return true;

  if (applicableType === "products") {
    const productIds = coupon.applicable_product_ids ?? [];
    return productIds.some((id) => itemIds.has(id));
  }

  if (applicableType === "categories") {
    const applicableCategoryIds = coupon.applicable_category_ids ?? [];
    return applicableCategoryIds.some((id) => categoryIds.has(id));
  }

  return false;
}

function hasRequiredQuantity(coupon: ExtendedCoupon, items: CartItemInput[]) {
  const discountType = coupon.discount_type_ext ?? coupon.discount_type;
  if (discountType !== "buy_x_get_y") return true;
  const requiredQty = coupon.buy_x_qty ?? 0;
  if (requiredQty <= 0) return true;

  const applicableProductIds = coupon.applicable_product_ids ?? [];
  const applicableItemIds = new Set(
    applicableProductIds.length > 0 ? applicableProductIds : items.map((item) => item.item_id)
  );
  const qualifyingQty = items.reduce(
    (sum, item) => sum + (applicableItemIds.has(item.item_id) ? item.quantity : 0),
    0
  );

  return qualifyingQty >= requiredQty;
}

function hasFreeProduct(coupon: ExtendedCoupon, itemIds: Set<string>) {
  const discountType = coupon.discount_type_ext ?? coupon.discount_type;
  if (discountType !== "free_product") return true;
  return coupon.free_product_id ? itemIds.has(coupon.free_product_id) : true;
}

function hasEligibleCustomerType(
  coupon: ExtendedCoupon,
  orderCount: number,
  membershipTier: string | null,
  userMetadata: Record<string, unknown>
) {
  const eligibility = coupon.customer_eligibility ?? "all";
  if (eligibility === "all") return true;
  if (eligibility === "new") return orderCount === 0;
  if (eligibility === "existing") return orderCount > 0;
  if (eligibility === "premium") return membershipTier === "sprout_hero" || membershipTier === "pnut_legend";
  if (eligibility === "student") {
    return userMetadata.is_student === true || userMetadata.customer_eligibility === "student";
  }
  return false;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as EligibleCouponRequest;
  const subtotal = Number(body.subtotal ?? 0);
  const outletId = body.outlet_id ?? null;
  const items = (body.items ?? []).filter((item) => item.item_id && item.quantity > 0);
  const code = body.code?.trim().toUpperCase();

  const supabase = await createClient("sb-customer-auth-token");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ coupons: [] });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  let couponQuery = admin
    .from("coupons")
    .select("*")
    .eq("is_active", true)
    .or("status.is.null,status.eq.active")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("priority" as never, { ascending: false })
    .order("created_at", { ascending: false });

  if (code) {
    couponQuery = couponQuery.eq("code", code);
  }

  const { data: couponData, error: couponError } = await couponQuery;
  if (couponError) {
    return NextResponse.json({ coupons: [] }, { status: 500 });
  }

  const coupons = (couponData ?? []) as ExtendedCoupon[];
  if (coupons.length === 0) {
    return NextResponse.json({ coupons: [] });
  }

  const couponIds = coupons.map((coupon) => coupon.id);
  const itemIds = new Set(items.map((item) => item.item_id));

  const [
    restrictionsResult,
    usageResult,
    orderCountResult,
    membershipResult,
    menuItemsResult,
  ] = await Promise.all([
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
    itemIds.size > 0
      ? admin
          .from("menu_items")
          .select("id, subcategory_id")
          .in("id", Array.from(itemIds))
      : Promise.resolve({ data: [], error: null }),
  ]);

  const restrictions: Record<string, string[]> = {};
  for (const row of ((restrictionsResult.data ?? []) as unknown as { coupon_id: string; outlet_id: string }[])) {
    restrictions[row.coupon_id] = [...(restrictions[row.coupon_id] ?? []), row.outlet_id];
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

  const menuRows = (menuItemsResult.data ?? []) as { id: string; subcategory_id: string }[];
  const subcategoryIds = Array.from(new Set(menuRows.map((row) => row.subcategory_id)));
  const { data: subcategoryData } = subcategoryIds.length > 0
    ? await admin
        .from("menu_subcategories")
        .select("id, category_id")
        .in("id", subcategoryIds)
    : { data: [] as { id: string; category_id: string }[] };
  const subcategoryToCategory = new Map(
    ((subcategoryData ?? []) as { id: string; category_id: string }[]).map((row) => [row.id, row.category_id])
  );
  const categoryIds = new Set(
    menuRows
      .map((row) => subcategoryToCategory.get(row.subcategory_id))
      .filter((categoryId): categoryId is string => Boolean(categoryId))
  );

  const eligibleCoupons = coupons.filter((coupon) => {
    const minCartValue = Math.max(coupon.min_order ?? 0, coupon.min_cart_value ?? 0);
    if (subtotal < minCartValue) return false;
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) return false;
    if (coupon.per_user_limit && (userUsageCounts[coupon.id] ?? 0) >= coupon.per_user_limit) return false;
    if (coupon.daily_limit && (dailyUsageCounts[coupon.id] ?? 0) >= coupon.daily_limit) return false;

    const restrictedOutlets = restrictions[coupon.id] ?? [];
    if (restrictedOutlets.length > 0 && (!outletId || !restrictedOutlets.includes(outletId))) return false;

    if (!hasEligibleCustomerType(coupon, orderCount, membershipTier, user.user_metadata ?? {})) return false;
    if (!hasApplicableItems(coupon, itemIds, categoryIds)) return false;
    if (!hasRequiredQuantity(coupon, items)) return false;
    if (!hasFreeProduct(coupon, itemIds)) return false;

    return true;
  });

  return NextResponse.json({ coupons: eligibleCoupons });
}
