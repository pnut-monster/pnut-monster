import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, welcomeEmail } from "@/lib/email";

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

    const template = welcomeEmail(name);
    const sent = await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    return NextResponse.json({ sent });
  } catch (error) {
    console.error("Welcome email error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
