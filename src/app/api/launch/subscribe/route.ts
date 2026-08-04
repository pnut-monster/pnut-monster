import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = (body.email as string || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    if (email.length > 320) {
      return NextResponse.json({ error: "Email too long" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { error } = await admin
      .from("launch_subscribers" as never)
      .upsert(
        { email, subscribed_at: new Date().toISOString() } as never,
        { onConflict: "email", ignoreDuplicates: true }
      );

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ success: true, message: "Already subscribed" });
      }
      console.error("Launch subscribe error:", error);
      return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Subscribed successfully" });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
