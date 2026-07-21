import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture, Base64URLString } from "@simplewebauthn/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertPasskeyOrigin,
  checkPasskeyRateLimit,
  findAdminByEmail,
  getPasskeyRp,
  requestIp,
  savePasskeyChallenge,
} from "@/lib/security/admin-passkeys";

const BodySchema = z.object({ email: z.string().trim().email().max(254) });

export async function POST(request: NextRequest) {
  const originError = assertPasskeyOrigin(request);
  if (originError) return originError;
  const limited = checkPasskeyRateLimit(`authenticate:${requestIp(request)}`, 10);
  if (limited) return limited;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid admin email" }, { status: 400 });

  const profile = await findAdminByEmail(parsed.data.email);
  if (!profile) return NextResponse.json({ error: "No passkey is available for this account" }, { status: 400 });
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_passkeys" as never)
    .select("credential_id, transports")
    .eq("user_id", profile.id);
  const credentials = (data ?? []) as Array<{ credential_id: string; transports: string[] }>;
  if (credentials.length === 0) {
    return NextResponse.json({ error: "No passkey is available for this account" }, { status: 400 });
  }

  const { rpID } = getPasskeyRp(request);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((credential) => ({
      id: credential.credential_id as Base64URLString,
      transports: credential.transports as AuthenticatorTransportFuture[],
    })),
    userVerification: "required",
  });
  const { error } = await savePasskeyChallenge(profile.id, "authentication", options.challenge);
  if (error) return NextResponse.json({ error: "Could not start passkey login" }, { status: 500 });
  return NextResponse.json(options);
}
