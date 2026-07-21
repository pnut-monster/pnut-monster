"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { Lock, Mail, AlertCircle, Fingerprint } from "lucide-react";
import toast from "react-hot-toast";

function clearAdminAuthCookies() {
  if (typeof document === "undefined") return;

  document.cookie
    .split(";")
    .map((cookie) => cookie.split("=")[0]?.trim())
    .filter((name) => name?.startsWith("sb-admin-auth-token"))
    .forEach((name) => {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    });
}

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      const message = "Please enter email and password";
      setError(message);
      toast.error(message);
      return;
    }

    setLoading(true);
    setError("");

    try {
      clearAdminAuthCookies();
      const client = createClient();

      // Step 1: Authenticate
      const { data, error: authError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
        toast.error(authError.message);
        setLoading(false);
        return;
      }

      if (!data.user) {
        const message = "Login failed. Please try again.";
        setError(message);
        toast.error(message);
        setLoading(false);
        return;
      }

      // Step 2: Verify admin role using service-role via API to bypass RLS timing
      const verifyRes = await fetch("/api/admin/verify-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id }),
      });

      const { role } = await verifyRes.json();

      if (!verifyRes.ok || (role !== "admin" && role !== "super_admin")) {
        const message = "Access denied. Admin or Super Admin role required.";
        setError(message);
        toast.error(message);
        await client.auth.signOut();
        setLoading(false);
        return;
      }

      const { data: assurance, error: assuranceError } =
        await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;

      if (assurance.currentLevel === "aal2") {
        toast.success("Logged in successfully.");
        router.push("/admin");
        return;
      }

      const { data: factors, error: factorsError } =
        await client.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const hasVerifiedTotp = factors.totp.some(
        (factor) => factor.status === "verified"
      );
      router.push(
        hasVerifiedTotp ? "/admin/mfa/verify" : "/admin/mfa/setup"
      );
    } catch (err: unknown) {
      console.error("Admin login error:", err);
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      toast.error(message);
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!email.trim()) {
      const message = "Enter your admin email first";
      setError(message);
      toast.error(message);
      return;
    }
    if (!("PublicKeyCredential" in window)) {
      const message = "This browser or device does not support passkeys";
      setError(message);
      toast.error(message);
      return;
    }

    setPasskeyLoading(true);
    setError("");
    try {
      clearAdminAuthCookies();
      const optionsRes = await fetch(
        "/api/admin/passkeys/authentication-options",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        }
      );
      const optionsBody = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsBody.error || "Could not start passkey login");

      const credential = await startAuthentication({
        optionsJSON: optionsBody as PublicKeyCredentialRequestOptionsJSON,
      });
      const verifyRes = await fetch(
        "/api/admin/passkeys/authentication-verify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), response: credential }),
        }
      );
      const verifyBody = await verifyRes.json();
      if (!verifyRes.ok || !verifyBody.tokenHash) {
        throw new Error(verifyBody.error || "Passkey login failed");
      }

      const client = createClient();
      const { data, error: sessionError } = await client.auth.verifyOtp({
        token_hash: verifyBody.tokenHash,
        type: "magiclink",
      });
      if (sessionError || !data.user) throw sessionError ?? new Error("Could not create session");

      const roleRes = await fetch("/api/admin/verify-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id }),
      });
      const roleBody = await roleRes.json();
      if (!roleRes.ok || !["admin", "super_admin"].includes(roleBody.role)) {
        await client.auth.signOut();
        throw new Error("Admin access required");
      }

      const { data: factors } = await client.auth.mfa.listFactors();
      const hasVerifiedTotp = factors?.totp.some(
        (factor) => factor.status === "verified"
      );
      router.push(
        hasVerifiedTotp ? "/admin/mfa/verify" : "/admin/mfa/setup"
      );
    } catch (passkeyError: unknown) {
      const message =
        passkeyError instanceof Error
          ? passkeyError.message
          : "Passkey login was cancelled";
      setError(message);
      toast.error(message);
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-brand-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src="/logo.webp"
            alt="PNUT MONSTER"
            width={96}
            height={96}
            priority
            className="mx-auto mb-2 object-contain"
          />
          <p className="text-brand-cream/60 text-sm mt-1">Admin Panel</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-6">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-brand-yellow/10 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6 text-brand-yellow-dark" />
            </div>
            <h2 className="font-heading text-xl font-bold text-brand-black">
              Admin Login
            </h2>
            <p className="text-sm text-brand-gray-500 mt-1">
              Sign in with your password and authenticator app
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4" suppressHydrationWarning>
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@pnutmonster.com"
              icon={<Mail className="w-4 h-4" />}
              autoComplete="username webauthn"
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              icon={<Lock className="w-4 h-4" />}
            />
            <Button
              type="submit"
              loading={loading}
              className="w-full"
            >
              Sign In
            </Button>
          </form>

          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-brand-gray-400">
            <span className="h-px flex-1 bg-brand-gray-200" />
            or
            <span className="h-px flex-1 bg-brand-gray-200" />
          </div>
          <Button
            type="button"
            variant="secondary"
            loading={passkeyLoading}
            onClick={handlePasskeyLogin}
            className="w-full"
          >
            <Fingerprint className="h-5 w-5" />
            Sign in with passkey
          </Button>

        </div>

        {/* Footer */}
        <p className="text-center text-brand-cream/30 text-xs mt-6">
          PNUT MONSTER Admin Panel v1.0
        </p>
      </div>
    </div>
  );
}
