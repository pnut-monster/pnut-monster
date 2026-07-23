import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin(request: NextRequest) {
  void request;
  const supabase = await createClient("sb-admin-auth-token");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile as { role?: string } | null)?.role;
  if (!role || !["admin", "super_admin"].includes(role)) return null;
  return user;
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { key, value } = body as { key: string; value: string };

    const ALLOWED_KEYS = ["require_2fa", "mfa_user_email"];
    if (!key || !ALLOWED_KEYS.includes(key)) {
      return NextResponse.json({ error: "Invalid setting key" }, { status: 400 });
    }

    if (typeof value !== "string" || value.length > 200) {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("app_settings")
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (error) {
      return NextResponse.json({ error: "Failed to update setting" }, { status: 500 });
    }

    return NextResponse.json({ success: true, key, value });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
