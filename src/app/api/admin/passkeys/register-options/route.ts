import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture, Base64URLString } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertPasskeyOrigin,
  checkPasskeyRateLimit,
  getPasskeyRp,
  requestIp,
  requireAal2Admin,
  savePasskeyChallenge,
} from "@/lib/security/admin-passkeys";

export async function POST(request: NextRequest) {
  const originError = assertPasskeyOrigin(request);
  if (originError) return originError;
  const limited = checkPasskeyRateLimit(`register:${requestIp(request)}`, 6);
  if (limited) return limited;

  const access = await requireAal2Admin();
  if (access.error || !access.user) return access.error;

  const admin = createAdminClient();
  const { data: credentials } = await admin
    .from("admin_passkeys" as never)
    .select("credential_id, transports")
    .eq("user_id", access.user.id);
  const existing = (credentials ?? []) as Array<{
    credential_id: string;
    transports: string[];
  }>;
  const { rpID } = getPasskeyRp(request);
  const options = await generateRegistrationOptions({
    rpName: "PNUT MONSTER Admin",
    rpID,
    userID: new TextEncoder().encode(access.user.id),
    userName: access.user.email ?? access.user.id,
    userDisplayName: access.user.user_metadata?.full_name ?? "PNUT Admin",
    attestationType: "none",
    excludeCredentials: existing.map((credential) => ({
      id: credential.credential_id as Base64URLString,
      transports: credential.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
    preferredAuthenticatorType: "localDevice",
  });

  const { error } = await savePasskeyChallenge(
    access.user.id,
    "registration",
    options.challenge
  );
  if (error) return NextResponse.json({ error: "Could not start passkey setup" }, { status: 500 });
  return NextResponse.json(options);
}
