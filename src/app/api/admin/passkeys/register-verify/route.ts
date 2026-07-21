import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertPasskeyOrigin,
  consumePasskeyChallenge,
  getPasskeyRp,
  requireAal2Admin,
  uint8ArrayToBase64,
} from "@/lib/security/admin-passkeys";

const BodySchema = z.object({
  name: z.string().trim().min(1).max(64),
  response: z.object({ id: z.string().min(1) }).passthrough(),
});

export async function POST(request: NextRequest) {
  const originError = assertPasskeyOrigin(request);
  if (originError) return originError;
  const access = await requireAal2Admin();
  if (access.error || !access.user) return access.error;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid passkey response" }, { status: 400 });

  const consumed = await consumePasskeyChallenge(access.user.id, "registration");
  if (consumed.error || !consumed.challenge) {
    return NextResponse.json({ error: "Passkey challenge expired" }, { status: 400 });
  }

  const { origin, rpID } = getPasskeyRp(request);
  try {
    const verification = await verifyRegistrationResponse({
      response: parsed.data.response as unknown as RegistrationResponseJSON,
      expectedChallenge: consumed.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Passkey verification failed" }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;
    const admin = createAdminClient();
    const { error } = await admin.from("admin_passkeys" as never).insert({
      user_id: access.user.id,
      name: parsed.data.name,
      credential_id: credential.id,
      public_key: uint8ArrayToBase64(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
    } as never);
    if (error) return NextResponse.json({ error: "Could not save passkey" }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Passkey verification failed" }, { status: 400 });
  }
}
