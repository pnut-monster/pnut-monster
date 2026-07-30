/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ windowId: string }> }
) {
  const { windowId } = await params;
  const supabase = await createClient();

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

  // Get batch window with outlet info
  const { data: batchWindow } = await supabase
    .from("batch_windows")
    .select("id, outlet_id, hub_id, start_time")
    .eq("id", windowId)
    .single();

  if (!batchWindow) {
    return NextResponse.json({ error: "Window not found" }, { status: 404 });
  }

  // Get outlet for label format config
  const { data: outlet } = await supabase
    .from("outlets")
    .select("name, batch_config")
    .eq("id", batchWindow.outlet_id)
    .single();

  const labelFormat = (outlet?.batch_config as Record<string, string> | null)?.label_format || "a4";

  // Get all batch orders with full details
  const { data: batchOrders } = await supabase
    .from("batch_orders")
    .select("order_id, block_id, sub_location_id, sub_location_text, sequence_number")
    .eq("batch_window_id", windowId)
    .order("sequence_number", { ascending: true });

  if (!batchOrders || batchOrders.length === 0) {
    return NextResponse.json({ error: "No orders in this batch" }, { status: 400 });
  }

  const orderIds = batchOrders.map(bo => bo.order_id);

  // Fetch orders with customer info
  const { data: orders } = await supabase
    .from("orders")
    .select("id, customer_id, notes")
    .in("id", orderIds);

  // Fetch customer profiles
  const customerIds = [...new Set(orders?.map(o => o.customer_id) || [])];
  const { data: customers } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .in("id", customerIds);

  // Fetch order items
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("order_id, item_name, quantity, customizations")
    .in("order_id", orderIds);

  // Fetch blocks
  const blockIds = [...new Set(batchOrders.map(bo => bo.block_id).filter(Boolean))];
  const { data: blocks } = await supabase
    .from("delivery_blocks")
    .select("id, name")
    .in("id", blockIds.length > 0 ? blockIds : ["00000000-0000-0000-0000-000000000000"]);

  // Fetch sub-locations
  const subLocIds = [...new Set(batchOrders.map(bo => bo.sub_location_id).filter(Boolean))];
  const { data: subLocations } = await supabase
    .from("delivery_sub_locations")
    .select("id, name")
    .in("id", subLocIds.length > 0 ? subLocIds : ["00000000-0000-0000-0000-000000000000"]);

  // Build labels
  const labels = batchOrders.map(bo => {
    const order = orders?.find(o => o.id === bo.order_id);
    const customer = customers?.find(c => c.id === order?.customer_id);
    const items = orderItems?.filter(oi => oi.order_id === bo.order_id) || [];
    const block = blocks?.find(b => b.id === bo.block_id);
    const subLoc = subLocations?.find(s => s.id === bo.sub_location_id);

    return {
      sequence: bo.sequence_number,
      order_id: bo.order_id,
      customer_name: customer?.full_name || "Unknown",
      customer_phone: customer?.phone || "",
      block_name: block?.name || "—",
      sub_location: subLoc?.name || bo.sub_location_text || "—",
      items: items.map(i => ({
        name: i.item_name,
        qty: i.quantity,
        customizations: i.customizations,
      })),
      notes: order?.notes || null,
      qr_data: bo.order_id,
    };
  });

  const windowDate = new Date(batchWindow.start_time).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return NextResponse.json({
    outlet_name: outlet?.name || "Unknown",
    window_date: windowDate,
    label_format: labelFormat,
    total_labels: labels.length,
    labels,
  });
}
