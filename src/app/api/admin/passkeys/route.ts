import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPasskeyOrigin, requireAal2Admin } from "@/lib/security/admin-passkeys";

export async function GET() {
  const access = await requireAal2Admin();
  if (access.error || !access.user) return access.error;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_passkeys" as never)
    .select("id, name, device_type, backed_up, created_at, last_used_at")
    .eq("user_id", access.user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load passkeys" }, { status: 500 });
  return NextResponse.json({ passkeys: data ?? [] });
}

const DeleteSchema = z.object({ id: z.string().uuid() });

export async function DELETE(request: NextRequest) {
  const originError = assertPasskeyOrigin(request);
  if (originError) return originError;
  const access = await requireAal2Admin();
  if (access.error || !access.user) return access.error;
  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid passkey" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin
    .from("admin_passkeys" as never)
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", access.user.id);
  if (error) return NextResponse.json({ error: "Could not remove passkey" }, { status: 500 });
  return NextResponse.json({ success: true });
}
