import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertPasskeyOrigin,
  base64ToUint8Array,
  consumePasskeyChallenge,
  findAdminByEmail,
  getPasskeyRp,
} from "@/lib/security/admin-passkeys";

const BodySchema = z.object({
  email: z.string().trim().email().max(254),
  response: z.object({ id: z.string().min(1) }).passthrough(),
});

export async function POST(request: NextRequest) {
  const originError = assertPasskeyOrigin(request);
  if (originError) return originError;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid passkey response" }, { status: 400 });
  const profile = await findAdminByEmail(parsed.data.email);
  if (!profile || !profile.email) return NextResponse.json({ error: "Passkey login failed" }, { status: 400 });

  const consumed = await consumePasskeyChallenge(profile.id, "authentication");
  if (consumed.error || !consumed.challenge) {
    return NextResponse.json({ error: "Passkey challenge expired" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_passkeys" as never)
    .select("id, credential_id, public_key, counter, transports")
    .eq("user_id", profile.id)
    .eq("credential_id", parsed.data.response.id)
    .maybeSingle();
  const credential = data as {
    id: string;
    credential_id: string;
    public_key: string;
    counter: number;
    transports: string[];
  } | null;
  if (!credential) return NextResponse.json({ error: "Passkey login failed" }, { status: 400 });

  const { origin, rpID } = getPasskeyRp(request);
  try {
    const verification = await verifyAuthenticationResponse({
      response: parsed.data.response as unknown as AuthenticationResponseJSON,
      expectedChallenge: consumed.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: credential.credential_id,
        publicKey: base64ToUint8Array(credential.public_key),
        counter: Number(credential.counter),
        transports: credential.transports as AuthenticatorTransportFuture[],
      },
    });
    if (!verification.verified) {
      return NextResponse.json({ error: "Passkey login failed" }, { status: 400 });
    }

    await admin
      .from("admin_passkeys" as never)
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      } as never)
      .eq("id", credential.id);

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
    });
    if (linkError || !link.properties?.hashed_token) {
      return NextResponse.json({ error: "Could not create admin session" }, { status: 500 });
    }
    return NextResponse.json({ tokenHash: link.properties.hashed_token });
  } catch {
    return NextResponse.json({ error: "Passkey login failed" }, { status: 400 });
  }
}
