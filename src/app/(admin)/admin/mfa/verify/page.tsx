"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

function safeRedirect(): string {
  if (typeof window === "undefined") return "/admin";
  const value = new URLSearchParams(window.location.search).get("redirect");
  return value?.startsWith("/admin") && !value.startsWith("//")
    ? value
    : "/admin";
}

export default function AdminMfaVerifyPage() {
  const router = useRouter();
  const supabase = createClient();
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadFactor() {
      const { data: assurance } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance?.currentLevel === "aal2") {
        router.replace(safeRedirect());
        return;
      }

      const { data, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const factor = data.totp[0];
      if (!factor) {
        router.replace("/admin/mfa/setup");
        return;
      }

      if (active) {
        setFactorId(factor.id);
        setLoading(false);
      }
    }

    loadFactor().catch((factorError: unknown) => {
      if (!active) return;
      setError(
        factorError instanceof Error
          ? factorError.message
          : "Could not load your authenticator"
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

    toast.success("Identity verified.");
    router.replace(safeRedirect());
    router.refresh();
  };

  return (
    <div className="min-h-dvh bg-brand-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-yellow/15">
            <ShieldCheck className="h-6 w-6 text-brand-yellow-dark" />
          </div>
          <h1 className="font-heading text-2xl font-bold">Two-factor verification</h1>
          <p className="mt-2 text-sm text-brand-gray-500">
            Enter the current code from your authenticator app.
          </p>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-brand-gray-500">
            Loading authenticator…
          </p>
        ) : (
          <form onSubmit={verifyCode} className="mt-6 space-y-4">
            {error && !factorId && (
              <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-5 w-5 shrink-0" />
                {error}
              </div>
            )}
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
              error={factorId ? error || undefined : undefined}
              autoFocus
            />
            <Button
              type="submit"
              loading={verifying}
              disabled={!factorId}
              className="w-full"
            >
              Verify and continue
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
