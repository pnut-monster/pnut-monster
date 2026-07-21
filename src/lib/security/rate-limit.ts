import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retry_after: number;
};

export function requestIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function consumeRateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const subjectHash = createHash("sha256").update(subject).digest("hex");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_api_rate_limit", {
    p_scope: scope,
    p_subject_hash: subjectHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  return data as unknown as RateLimitResult;
}
