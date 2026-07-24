import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email/service";
import { isEmailInfrastructureConfigured } from "@/lib/email/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inventory_item_id, item_name, quantity, min_stock_level, unit, outlet_name, outlet_id } = body as {
      inventory_item_id: string;
      item_name: string;
      quantity: number;
      min_stock_level: number;
      unit: string;
      outlet_name: string;
      outlet_id: string;
    };

    if (!inventory_item_id || !item_name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: admins } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("role", ["admin", "super_admin"]);

    if (!admins || admins.length === 0) {
      return NextResponse.json({ error: "No admin users found" }, { status: 404 });
    }

    const adminEmails = (admins as { id: string; email: string | null; full_name: string | null }[])
      .filter((a) => a.email)
      .map((a) => a.email!);

    if (adminEmails.length === 0) {
      return NextResponse.json({ error: "No admin emails configured" }, { status: 404 });
    }

    if (!isEmailInfrastructureConfigured()) {
      return NextResponse.json({
        success: false,
        message: "Email infrastructure not configured. In-app notification sent.",
      });
    }

    const websiteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://pnut.monster";

    await sendTemplateEmail({
      template: "notification",
      to: adminEmails,
      data: {
        userName: "Admin",
        heading: "Low Stock Alert",
        message: `${item_name} at ${outlet_name || "your outlet"} has dropped to ${quantity} ${unit}, which is below the minimum threshold of ${min_stock_level} ${unit}. Please restock this item soon to avoid disruption.`,
        buttonText: "View Inventory",
        buttonUrl: `${websiteUrl}/admin/inventory?outlet=${outlet_id}`,
      },
      tags: { alert_type: "low_stock", inventory_item_id },
    });

    return NextResponse.json({ success: true, emailsSent: adminEmails.length });
  } catch (error) {
    console.error("[Inventory Alert Email]", error);
    return NextResponse.json({ error: "Failed to send alert email" }, { status: 500 });
  }
}

// GET: Fetch unresolved low-stock alerts
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("inventory_alerts" as never)
      .select("*" as never)
      .eq("resolved" as never, false as never)
      .order("created_at" as never, { ascending: false } as never);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alerts: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
