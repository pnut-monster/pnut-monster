import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  EMAIL_TEMPLATE_NAMES,
  getEmailTemplateCacheStats,
  invalidateEmailTemplateCache,
} from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  template: z.enum(EMAIL_TEMPLATE_NAMES).optional(),
});

async function requireAdmin() {
  const supabase = await createClient("sb-admin-auth-token");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (data as { role?: string } | null)?.role;
  return role === "admin" || role === "super_admin";
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return origin === request.nextUrl.origin || origin === configured;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(getEmailTemplateCacheStats());
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid template name" }, { status: 400 });
  }
  const removed = invalidateEmailTemplateCache(parsed.data.template);
  return NextResponse.json({ invalidated: removed, template: parsed.data.template ?? "all" });
}

