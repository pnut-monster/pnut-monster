"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { Lock, Mail, AlertCircle } from "lucide-react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const client = createClient();

      // Step 1: Authenticate
      const { data, error: authError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!data.user) {
        setError("Login failed. Please try again.");
        setLoading(false);
        return;
      }

      // Step 2: Verify admin role
      const { data: profile } = await client
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single() as { data: { role: string } | null };

      if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
        setError("Access denied. Admin or Super Admin role required.");
        await client.auth.signOut();
        setLoading(false);
        return;
      }

      router.push("/admin");
    } catch (err: unknown) {
      console.error("Admin login error:", err);
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-brand-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.webp" alt="PNUT MONSTER" className="w-24 h-24 mx-auto mb-2 object-contain" />
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
              Sign in with your admin credentials
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

        </div>

        {/* Footer */}
        <p className="text-center text-brand-cream/30 text-xs mt-6">
          PNUT MONSTER Admin Panel v1.0
        </p>
      </div>
    </div>
  );
}
