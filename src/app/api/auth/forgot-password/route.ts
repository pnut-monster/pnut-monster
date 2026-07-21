import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit, requestIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const RequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

function isAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const allowedOrigins = new Set([request.nextUrl.origin]);
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    allowedOrigins.add(process.env.NEXT_PUBLIC_SITE_URL);
  }

  return allowedOrigins.has(origin);
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Password reset is temporarily unavailable" },
      { status: 503 }
    );
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter a valid email address" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { email } = parsed.data;
  const [ipLimit, emailLimit] = await Promise.all([
    consumeRateLimit("forgot_password_ip", requestIp(request), 8, 900),
    consumeRateLimit("forgot_password_email", email, 3, 3600),
  ]);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return NextResponse.json(
      { error: "Too many reset requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(ipLimit.retry_after, emailLimit.retry_after)) },
      }
    );
  }

  // Supabase sends the recovery token as an OTP when the recovery email
  // template renders {{ .Token }} instead of {{ .ConfirmationURL }}.
  const { error } = await admin.auth.resetPasswordForEmail(email);

  if (error && !/user not found/i.test(error.message)) {
    console.error("Password reset delivery failed", error);
    return NextResponse.json(
      { error: "Could not process the reset request" },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { success: true, message: "If an account exists, reset instructions will be sent." },
    { headers: { "Cache-Control": "no-store" } }
  );
}
