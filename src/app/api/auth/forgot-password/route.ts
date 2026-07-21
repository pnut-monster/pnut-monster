import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const { data: profile, error: lookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json(
      { error: "Could not verify this account. Please try again." },
      { status: 500 }
    );
  }

  if (!profile) {
    return NextResponse.json(
      { error: "No account is registered with this email address." },
      { status: 404 }
    );
  }

  // Supabase sends the recovery token as an OTP when the recovery email
  // template renders {{ .Token }} instead of {{ .ConfirmationURL }}.
  const { error } = await admin.auth.resetPasswordForEmail(email);

  if (error) {
    return NextResponse.json(
      { error: error.message || "Could not send the reset link" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
