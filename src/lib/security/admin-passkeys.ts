import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkPasskeyRateLimit(key: string, limit = 10) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 60_000 });
    return null;
  }
  if (current.count >= limit) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  current.count += 1;
  return null;
}

export function assertPasskeyOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const allowed = new Set([request.nextUrl.origin]);
  if (configured) allowed.add(configured);
  if (!allowed.has(origin)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  return null;
}

export function getPasskeyRp(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const origin =
    process.env.NODE_ENV === "production" && configured
      ? configured
      : request.nextUrl.origin;
  return { origin, rpID: new URL(origin).hostname };
}

export function requestIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

export async function requireAal2Admin() {
  const supabase = await createClient("sb-admin-auth-token");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel !== "aal2") {
    return {
      user: null,
      error: NextResponse.json({ error: "Two-factor authentication required" }, { status: 403 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, error: null };
}

export async function findAdminByEmail(email: string) {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 254) return null;
  const { data } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("email", normalized)
    .in("role", ["admin", "super_admin"])
    .maybeSingle();
  return data as { id: string; email: string | null; role: string } | null;
}

export async function savePasskeyChallenge(
  userId: string,
  ceremony: "registration" | "authentication",
  challenge: string
) {
  const admin = createAdminClient();
  await admin
    .from("admin_passkey_challenges" as never)
    .delete()
    .eq("user_id", userId)
    .eq("ceremony", ceremony);
  return admin.from("admin_passkey_challenges" as never).insert({
    user_id: userId,
    ceremony,
    challenge,
    expires_at: new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS).toISOString(),
  } as never);
}

export async function consumePasskeyChallenge(
  userId: string,
  ceremony: "registration" | "authentication"
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_passkey_challenges" as never)
    .update({ consumed_at: new Date().toISOString() } as never)
    .eq("user_id", userId)
    .eq("ceremony", ceremony)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("challenge")
    .maybeSingle();
  return {
    challenge: (data as { challenge: string } | null)?.challenge ?? null,
    error,
  };
}

export function uint8ArrayToBase64(value: Uint8Array) {
  return Buffer.from(value).toString("base64");
}

export function base64ToUint8Array(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}
