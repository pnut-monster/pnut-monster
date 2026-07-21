import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendTemplateEmail } from "@/lib/email";
import { welcomeEmailData } from "@/lib/email/templates";

export async function POST() {
  try {
    const supabase = await createClient("sb-customer-auth-token");
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const email = (profile as { email: string | null } | null)?.email || user.email;
    const name = (profile as { full_name: string | null } | null)?.full_name || "there";

    if (!email) {
      return NextResponse.json({ error: "No email address" }, { status: 400 });
    }

    const result = await sendTemplateEmail({
      template: "welcome",
      to: email,
      data: welcomeEmailData(name),
      tags: { source: "welcome_api" },
    });

    return NextResponse.json({ sent: true, messageId: result.messageId });
  } catch (error) {
    console.error("Welcome email error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
