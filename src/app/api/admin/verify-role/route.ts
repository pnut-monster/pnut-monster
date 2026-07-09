import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const supabase = await createClient("sb-admin-auth-token");
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.id !== userId) {
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const callerRole = (callerProfile as { role?: string } | null)?.role;
      if (!callerRole || !["admin", "super_admin"].includes(callerRole)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", userId)
      .single() as { data: { role: string; full_name: string | null } | null; error: unknown };

    if (error || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ role: profile.role, full_name: profile.full_name });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
