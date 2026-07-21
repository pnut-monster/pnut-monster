"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, KeyRound, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function AdminMfaSetupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const enrollmentRef = useRef<Promise<
    | { verified: true }
    | { verified: false; id: string; qrCode: string; secret: string }
  > | null>(null);

  useEffect(() => {
    let active = true;

    if (!enrollmentRef.current) {
      enrollmentRef.current = (async () => {
        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        if (factors.totp[0]) return { verified: true as const };

        for (const factor of (factors.all as Array<{ id: string; factor_type: string; status: string }>).filter(
          (existing) =>
            existing.factor_type === "totp" && existing.status === "unverified"
        )) {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }

        const { data, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "PNUT MONSTER Admin",
        });
        if (enrollError) throw enrollError;
        const rawQrCode = data.totp.qr_code.trim();
        const rawSvgPrefix = "data:image/svg+xml;utf-8,";
        const safeQrCode = rawQrCode.startsWith(rawSvgPrefix)
          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
              rawQrCode.slice(rawSvgPrefix.length).trim()
            )}`
          : rawQrCode;
        return {
          verified: false as const,
          id: data.id,
          qrCode: safeQrCode,
          secret: data.totp.secret,
        };
      })();
    }

    enrollmentRef.current
      .then((result) => {
        if (!active) return;
        if (result.verified) {
          router.replace("/admin/mfa/verify");
          return;
        }
        setFactorId(result.id);
        setQrCode(result.qrCode);
        setSecret(result.secret);
        setLoading(false);
      })
      .catch((setupError: unknown) => {
        if (!active) return;
        setError(
          setupError instanceof Error
            ? setupError.message
            : "Could not start authenticator setup"
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [router, supabase]);

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError("Enter the six-digit code from your authenticator app.");
      return;
    }

    setVerifying(true);
    setError("");
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });

    if (verifyError) {
      setError("That code is invalid or expired. Try the newest code.");
      setVerifying(false);
      return;
    }

    toast.success("Authenticator app enabled.");
    router.replace("/admin");
    router.refresh();
  };

  return (
    <div className="min-h-dvh bg-brand-black flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-yellow/15">
            <ShieldCheck className="h-6 w-6 text-brand-yellow-dark" />
          </div>
          <h1 className="font-heading text-2xl font-bold">Secure your admin account</h1>
          <p className="mt-2 text-sm text-brand-gray-500">
            Two-factor authentication is required for every administrator.
          </p>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-brand-gray-500">
            Preparing authenticator setup…
          </p>
        ) : error && !qrCode ? (
          <div className="mt-6 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        ) : (
          <form onSubmit={verifyCode} className="mt-6 space-y-5">
            <ol className="space-y-4 text-sm text-brand-gray-700">
              <li>
                <strong>1.</strong> Open Google Authenticator, Microsoft
                Authenticator, Authy, or another TOTP app.
              </li>
              <li>
                <strong>2.</strong> Scan this QR code.
                <div className="mx-auto mt-3 w-fit rounded-xl border bg-white p-3">
                  <Image
                    src={qrCode}
                    alt="Authenticator setup QR code"
                    width={200}
                    height={200}
                    unoptimized
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(secret);
                    toast.success("Setup key copied.");
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-2 break-all rounded-lg bg-brand-gray-50 px-3 py-2 font-mono text-xs"
                >
                  <KeyRound className="h-4 w-4 shrink-0" />
                  {secret}
                </button>
              </li>
              <li>
                <strong>3.</strong> Enter the current six-digit code.
              </li>
            </ol>

            <Input
              label="Authenticator code"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              className="text-center font-mono text-xl tracking-[0.4em]"
              error={error || undefined}
              autoFocus
            />
            <Button type="submit" loading={verifying} className="w-full">
              Enable two-factor authentication
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
