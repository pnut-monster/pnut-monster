// @ts-nocheck — batch tables not yet in generated types; remove after running migrations + type gen
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ windowId: string }> }
) {
  const { windowId } = await params;
  const supabase = await createClient();

  // Verify auth and admin/staff role
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin", "outlet_staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get batch window
  const { data: window } = await supabase
    .from("batch_windows")
    .select("id, outlet_id, start_time, end_time, current_order_count, status")
    .eq("id", windowId)
    .single();

  if (!window) {
    return NextResponse.json({ error: "Window not found" }, { status: 404 });
  }

  // Get outlet name
  const { data: outlet } = await supabase
    .from("outlets")
    .select("name")
    .eq("id", window.outlet_id)
    .single();

  // Get all order items for this batch window
  const { data: batchOrders } = await supabase
    .from("batch_orders")
    .select("order_id")
    .eq("batch_window_id", windowId);

  if (!batchOrders || batchOrders.length === 0) {
    return NextResponse.json({ error: "No orders in this batch" }, { status: 400 });
  }

  const orderIds = batchOrders.map(bo => bo.order_id);

  const { data: orderItems } = await supabase
    .from("order_items")
    .select("item_id, item_name, quantity, customizations")
    .in("order_id", orderIds);

  if (!orderItems) {
    return NextResponse.json({ error: "Failed to fetch order items" }, { status: 500 });
  }

  // Try to get component-level breakdown
  const itemIds = [...new Set(orderItems.map(oi => oi.item_id))];
  const { data: components } = await supabase
    .from("item_components")
    .select("*")
    .in("menu_item_id", itemIds);

  // Build aggregation
  type AggItem = { name: string; quantity: number; category: string; unit: string; instruction?: string };
  const aggregated: Map<string, AggItem> = new Map();

  if (components && components.length > 0) {
    // Component-level aggregation (Phase 3 prep)
    for (const oi of orderItems) {
      const itemComponents = components.filter(c => c.menu_item_id === oi.item_id && !c.customization_option_id);
      for (const comp of itemComponents) {
        const key = `${comp.component_category}:${comp.component_name}`;
        const existing = aggregated.get(key);
        if (existing) {
          existing.quantity += comp.quantity * oi.quantity;
        } else {
          aggregated.set(key, {
            name: comp.component_name,
            quantity: comp.quantity * oi.quantity,
            category: comp.component_category,
            unit: comp.unit,
            instruction: comp.prep_instruction_template || undefined,
          });
        }
      }
    }
  } else {
    // Item-level aggregation (Phase 1 fallback)
    for (const oi of orderItems) {
      const key = `item:${oi.item_name}`;
      const existing = aggregated.get(key);
      if (existing) {
        existing.quantity += oi.quantity;
      } else {
        aggregated.set(key, {
          name: oi.item_name,
          quantity: oi.quantity,
          category: "items",
          unit: "piece",
        });
      }
    }
  }

  // Group by category
  const grouped: Record<string, AggItem[]> = {};
  for (const item of aggregated.values()) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  // Sort within categories by quantity (descending)
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => b.quantity - a.quantity);
  }

  const startDate = new Date(window.start_time);
  const endDate = new Date(window.end_time);

  const prepSheet = {
    title: "PNUT MONSTER — BATCH PREP SHEET",
    outlet: (outlet as { name: string } | null)?.name || "Unknown",
    window_time: `${startDate.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })} – ${endDate.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })}`,
    date: startDate.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" }),
    total_orders: window.current_order_count,
    total_items: orderItems.reduce((s, oi) => s + oi.quantity, 0),
    categories: grouped,
  };

  return NextResponse.json(prepSheet);
}
