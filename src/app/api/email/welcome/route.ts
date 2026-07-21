import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendTemplateEmail } from "@/lib/email";
import { welcomeEmailData } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export async function POST() {
  try {
    const supabase = await createClient("sb-customer-auth-token");
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await consumeRateLimit("welcome_email", user.id, 2, 86400);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Welcome email was already requested" },
        { status: 429, headers: { "Retry-After": String(rateLimit.retry_after) } }
      );
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email, welcome_email_sent_at")
      .eq("id", user.id)
      .single();

    if ((profile as { welcome_email_sent_at?: string | null } | null)?.welcome_email_sent_at) {
      return NextResponse.json({ sent: false, alreadySent: true });
    }

    const email = (profile as { email: string | null } | null)?.email || user.email;
    const name = (profile as { full_name: string | null } | null)?.full_name || "there";

    if (!email) {
      return NextResponse.json({ error: "No email address" }, { status: 400 });
    }

    const { data: claimed, error: claimError } = await admin
      .from("profiles")
      .update({ welcome_email_sent_at: new Date().toISOString() } as never)
      .eq("id", user.id)
      .is("welcome_email_sent_at" as never, null)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return NextResponse.json({ sent: false, alreadySent: true });

    try {
      const result = await sendTemplateEmail({
      template: "welcome",
      to: email,
      data: welcomeEmailData(name),
      tags: { source: "welcome_api" },
      });

      return NextResponse.json({ sent: true, messageId: result.messageId });
    } catch (error) {
      await admin
        .from("profiles")
        .update({ welcome_email_sent_at: null } as never)
        .eq("id", user.id);
      throw error;
    }
  } catch (error) {
    console.error("Welcome email error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
