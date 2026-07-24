import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestIp } from "@/lib/security/admin-passkeys";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(key: string) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count += 1;
  return false;
}

async function getAuthenticatedAdmin() {
  const supabase = await createClient("sb-admin-auth-token");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, supabase };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes((profile as { role: string }).role)) {
    return { user: null, supabase };
  }
  return { user, supabase };
}

// POST: Step 1 - Verify identity (password + current 2FA code)
// POST: Step 2 - Confirm new device (verify new TOTP code and finalize)
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedAdmin();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = requestIp(request);
    if (checkRateLimit(`change-2fa:${user.id}`)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { step } = body as { step: string };

    if (step === "verify-identity") {
      const { password, totpCode } = body as {
        password: string;
        totpCode: string;
      };

      if (!password || typeof password !== "string") {
        return NextResponse.json({ error: "Password is required" }, { status: 400 });
      }
      if (!totpCode || !/^\d{6}$/.test(totpCode)) {
        return NextResponse.json({ error: "Valid 6-digit code is required" }, { status: 400 });
      }

      // Verify password by attempting to sign in
      const adminClient = createAdminClient();
      const { error: signInError } = await adminClient.auth.admin.getUserById(user.id);
      if (signInError) {
        return NextResponse.json({ error: "Identity verification failed" }, { status: 403 });
      }

      // Verify password via reauthentication
      const verifySupabase = await createClient("sb-admin-auth-token");
      const { error: reauthError } = await verifySupabase.auth.reauthenticate();
      if (reauthError) {
        // Fallback: verify password by signing in with credentials
        const { data: userData } = await adminClient.auth.admin.getUserById(user.id);
        if (!userData?.user?.email) {
          return NextResponse.json({ error: "Identity verification failed" }, { status: 403 });
        }

        const tempClient = createAdminClient();
        const { error: pwError } = await tempClient.auth.signInWithPassword({
          email: userData.user.email,
          password,
        });
        if (pwError) {
          return NextResponse.json({ error: "Invalid password" }, { status: 403 });
        }
      }

      // Verify current TOTP code
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const currentFactor = factors?.totp?.find((f) => f.status === "verified");
      if (!currentFactor) {
        return NextResponse.json({ error: "No active 2FA device found" }, { status: 400 });
      }

      const { error: challengeError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: currentFactor.id,
        code: totpCode,
      });
      if (challengeError) {
        return NextResponse.json({ error: "Invalid 2FA code" }, { status: 403 });
      }

      // Identity verified - enroll a new TOTP factor
      const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "PNUT MONSTER Admin (new device)",
      });
      if (enrollError) {
        return NextResponse.json(
          { error: "Failed to generate new authenticator. Try again." },
          { status: 500 }
        );
      }

      // Process QR code for display
      const rawQrCode = enrollData.totp.qr_code.trim();
      const rawSvgPrefix = "data:image/svg+xml;utf-8,";
      const safeQrCode = rawQrCode.startsWith(rawSvgPrefix)
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
            rawQrCode.slice(rawSvgPrefix.length).trim()
          )}`
        : rawQrCode;

      return NextResponse.json({
        success: true,
        factorId: enrollData.id,
        qrCode: safeQrCode,
        secret: enrollData.totp.secret,
        uri: enrollData.totp.uri,
      });
    }

    if (step === "confirm-new-device") {
      const { factorId, totpCode } = body as {
        factorId: string;
        totpCode: string;
      };

      if (!factorId || typeof factorId !== "string") {
        return NextResponse.json({ error: "Factor ID is required" }, { status: 400 });
      }
      if (!totpCode || !/^\d{6}$/.test(totpCode)) {
        return NextResponse.json({ error: "Valid 6-digit code is required" }, { status: 400 });
      }

      // Verify the new TOTP code
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: totpCode,
      });
      if (verifyError) {
        return NextResponse.json(
          { error: "Invalid code. The old authenticator remains active." },
          { status: 403 }
        );
      }

      // Unenroll old factors (all verified TOTP factors except the new one)
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const oldFactors = factors?.totp?.filter(
        (f) => f.id !== factorId && f.status === "verified"
      );
      if (oldFactors) {
        for (const oldFactor of oldFactors) {
          await supabase.auth.mfa.unenroll({ factorId: oldFactor.id });
        }
      }

      // Also clean up any other unverified factors that aren't the new one
      const allFactors = factors?.all as Array<{ id: string; factor_type: string; status: string }> | undefined;
      const unverifiedFactors = allFactors?.filter(
        (f) => f.id !== factorId && f.factor_type === "totp" && f.status === "unverified"
      );
      if (unverifiedFactors) {
        for (const uf of unverifiedFactors) {
          await supabase.auth.mfa.unenroll({ factorId: uf.id });
        }
      }

      // Record audit log
      const adminClient = createAdminClient();
      await adminClient.from("admin_audit_log" as never).insert({
        admin_id: user.id,
        action: "2FA device changed",
        ip_address: ip,
        metadata: { old_factor_count: oldFactors?.length ?? 0 },
      } as never);

      return NextResponse.json({
        success: true,
        message: "2FA device changed successfully. Use your new authenticator for future logins.",
      });
    }

    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
