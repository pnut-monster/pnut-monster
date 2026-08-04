import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";

async function requireAdmin() {
  const supabase = await createClient("sb-admin-auth-token");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance.currentLevel !== "aal2") return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile as { role?: string } | null)?.role;
  if (!role || !["admin", "super_admin"].includes(role)) return null;
  return user;
}

export async function POST(request: NextRequest) {
  void request;
  try {
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: subscribers, error: fetchError } = await admin
      .from("launch_subscribers" as never)
      .select("id, email")
      .is("notified_at" as never, null) as { data: { id: string; email: string }[] | null; error: { message: string } | null };

    if (fetchError) {
      console.error("Fetch subscribers error:", fetchError);
      return NextResponse.json({ error: "Failed to fetch subscribers" }, { status: 500 });
    }

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: "No pending subscribers" });
    }

    let sent = 0;
    let failed = 0;
    const batchSize = 5;

    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (sub) => {
          const result = await sendTemplateEmail({
            template: "announcement",
            to: sub.email,
            data: {
              userName: "there",
              heading: "Ordering is Now Live! 🎉",
              message:
                "Great news! Online ordering is officially open on PNUT MONSTER. " +
                "Browse our menu, customize your favourites, and place your first order today. " +
                "Thank you for your patience — we can't wait to serve you!",
              buttonText: "Order Now",
              buttonUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://pnut.monster",
            },
            tags: { purpose: "launch-notification" },
          });
          if (result.success) {
            await admin
              .from("launch_subscribers" as never)
              .update({ notified_at: new Date().toISOString() } as never)
              .eq("id" as never, sub.id as never);
          }
          return result;
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value.success) sent++;
        else failed++;
      }
    }

    return NextResponse.json({ success: true, sent, failed, total: subscribers.length });
  } catch (err) {
    console.error("Send launch notification error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
