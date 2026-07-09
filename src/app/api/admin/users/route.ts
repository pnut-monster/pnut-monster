import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const ELEVATED_ROLES = new Set(["admin", "super_admin"]);

const CreateUserSchema = z.object({
  email: z.string().trim().email(),
  full_name: z.string().trim().min(1),
  phone: z.string().trim().optional().nullable(),
  role: z.enum(["customer", "outlet_staff", "admin", "super_admin"]),
});

const UpdateUserRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["customer", "outlet_staff", "admin", "super_admin"]),
});

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const allowedOrigins = new Set([request.nextUrl.origin]);
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredOrigin) allowedOrigins.add(configuredOrigin);

  if (!allowedOrigins.has(origin)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  return null;
}

async function requireAdmin() {
  const supabase = await createClient("sb-admin-auth-token");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile as { role?: string } | null)?.role;
  if (!role || !ADMIN_ROLES.has(role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { error: null, role };
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const access = await requireAdmin();
  if (access.error) return access.error;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured" },
      { status: 500 }
    );
  }

  const parsed = CreateUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid user details" }, { status: 400 });
  }

  const payload = parsed.data;
  if (ELEVATED_ROLES.has(payload.role) && access.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can create admin users" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const temporaryPassword = `${randomBytes(24).toString("base64url")}aA1!`;

  const { data, error } = await admin.auth.admin.createUser({
    email: payload.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: payload.full_name,
      phone: payload.phone ?? null,
      role: payload.role,
    },
  });

  if (error || !data.user) {
    const status = error?.message.toLowerCase().includes("already") ? 409 : 400;
    return NextResponse.json(
      { error: error?.message ?? "Could not create user" },
      { status }
    );
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: data.user.id,
      email: payload.email,
      full_name: payload.full_name,
      phone: payload.phone || null,
      role: payload.role,
    } as never,
    { onConflict: "id" }
  );

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    return NextResponse.json(
      { error: profileError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: data.user.id,
    email: payload.email,
    role: payload.role,
  });
}

export async function PATCH(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const access = await requireAdmin();
  if (access.error) return access.error;

  const parsed = UpdateUserRoleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role update" }, { status: 400 });
  }

  const payload = parsed.data;
  if (ELEVATED_ROLES.has(payload.role) && access.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can grant admin roles" },
      { status: 403 }
    );
  }

  const supabase = await createClient("sb-admin-auth-token");
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", payload.userId)
    .single();

  const targetRole = (targetProfile as { role?: string } | null)?.role;
  if (ELEVATED_ROLES.has(targetRole ?? "") && access.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can change admin users" },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: payload.role } as never)
    .eq("id", payload.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: payload.userId, role: payload.role });
}
