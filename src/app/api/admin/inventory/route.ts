import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function getAuthenticatedAdmin() {
  const supabase = await createClient("sb-admin-auth-token");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes((profile as { role: string }).role)) {
    return null;
  }
  return user;
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, payload, item_id, log_payload } = body as {
      action: "insert" | "update" | "delete" | "stock_update";
      payload?: Record<string, unknown>;
      item_id?: string;
      log_payload?: Record<string, unknown>;
    };

    const admin = createAdminClient();

    if (action === "insert" && payload) {
      const { data, error } = await admin
        .from("inventory_items")
        .insert(payload as never)
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: 400 });
      }
      return NextResponse.json({ success: true, data });
    }

    if (action === "update" && item_id && payload) {
      const { data, error } = await admin
        .from("inventory_items")
        .update(payload as never)
        .eq("id", item_id)
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: 400 });
      }
      return NextResponse.json({ success: true, data });
    }

    if (action === "stock_update" && item_id && payload && log_payload) {
      const { error: updateError } = await admin
        .from("inventory_items")
        .update(payload as never)
        .eq("id", item_id);
      if (updateError) {
        return NextResponse.json({ error: updateError.message, code: updateError.code }, { status: 400 });
      }
      const { error: logError } = await admin
        .from("inventory_logs")
        .insert({ ...log_payload, performed_by: user.id } as never);
      if (logError) {
        return NextResponse.json({ error: logError.message, code: logError.code }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "delete" && item_id) {
      const { error } = await admin
        .from("inventory_items")
        .delete()
        .eq("id", item_id);
      if (error) {
        return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const outletId = request.nextUrl.searchParams.get("outlet_id");
  if (!outletId) {
    return NextResponse.json({ error: "outlet_id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("inventory_items")
    .select("*")
    .eq("outlet_id", outletId)
    .order("category")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
