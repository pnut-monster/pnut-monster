import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit, requestIp } from "@/lib/security/rate-limit";
import { sendTemplateEmail, isEmailInfrastructureConfigured } from "@/lib/email";

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
      { error: "OTP service is temporarily unavailable" },
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

  const { email } = parsed.data;

  const [ipLimit, emailLimit] = await Promise.all([
    consumeRateLimit("otp_send_ip", requestIp(request), 10, 900),
    consumeRateLimit("otp_send_email", email, 5, 300),
  ]);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(ipLimit.retry_after, emailLimit.retry_after)) },
      }
    );
  }

  const admin = createAdminClient();

  // generateLink creates the OTP in Supabase auth without sending an email,
  // so we can deliver it ourselves via the branded SES template.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { data: {} },
  });

  if (linkError) {
    if (/user not found/i.test(linkError.message)) {
      const { error: signUpError } = await admin.auth.admin.createUser({
        email,
        email_confirm: false,
      });
      if (signUpError && !/already registered/i.test(signUpError.message)) {
        return NextResponse.json(
          { error: "Could not process request" },
          { status: 503 }
        );
      }

      const { data: retryData, error: retryError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { data: {} },
      });
      if (retryError || !retryData?.properties?.email_otp) {
        return NextResponse.json(
          { error: "Could not generate verification code" },
          { status: 503 }
        );
      }

      await sendOtpEmail(
        email,
        retryData.properties.email_otp,
        retryData.user?.user_metadata?.full_name
      );

      return NextResponse.json(
        { success: true, message: "OTP sent" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { error: "Could not generate verification code" },
      { status: 503 }
    );
  }

  if (!linkData?.properties?.email_otp) {
    return NextResponse.json(
      { error: "Could not generate verification code" },
      { status: 503 }
    );
  }

  await sendOtpEmail(
    email,
    linkData.properties.email_otp,
    linkData.user?.user_metadata?.full_name
  );

  return NextResponse.json(
    { success: true, message: "OTP sent" },
    { headers: { "Cache-Control": "no-store" } }
  );
}

async function sendOtpEmail(email: string, otp: string, userName?: string) {
  if (!isEmailInfrastructureConfigured()) return;

  await sendTemplateEmail({
    template: "otp-verification",
    to: email,
    data: {
      userName: userName || email.split("@")[0],
      otp,
      expiryTime: "5 minutes",
    },
    tags: { flow: "login-otp" },
  }).catch((err) => {
    console.error("Failed to send OTP email via SES:", err);
  });
}
