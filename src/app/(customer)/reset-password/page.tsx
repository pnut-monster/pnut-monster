"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const prepareRecoverySession = async () => {
      const supabase = createClient();
      const code = searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          toast.error(error.message);
          router.replace("/forgot-password");
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Password reset link is expired or invalid.");
        router.replace("/forgot-password");
        return;
      }

      setReady(true);
    };

    prepareRecoverySession();
  }, [router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error(error.message);
        return;
      }

      setComplete(true);
      toast.success("Password updated");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (complete) {
    return (
      <div className="min-h-dvh bg-brand-cream flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 bg-brand-green/20 rounded-2xl flex items-center justify-center mb-6">
          <CheckCircle className="w-8 h-8 text-brand-green" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-brand-black text-center mb-2">
          Password updated
        </h1>
        <p className="text-brand-gray-500 text-sm text-center max-w-xs mb-8">
          You can now sign in with your new password.
        </p>
        <Link
          href="/login"
          className="bg-brand-yellow text-brand-black font-bold py-3 px-8 rounded-xl text-sm hover:bg-brand-yellow-dark transition-colors"
        >
          Back to Login
        </Link>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-dvh bg-brand-cream flex flex-col items-center justify-center px-6">
        <Loader2 className="w-10 h-10 text-brand-yellow animate-spin mb-4" />
        <p className="text-brand-gray-500 text-sm">Preparing reset form...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-brand-cream flex flex-col">
      <div className="flex-1 flex flex-col items-center px-6 pt-16">
        <Image
          src="/logo.webp"
          alt="PNUT MONSTER"
          width={80}
          height={80}
          priority
          className="mb-4 object-contain"
        />

        <h1 className="font-heading text-2xl font-bold text-brand-black text-center">
          Reset your password
        </h1>
        <p className="text-brand-gray-500 text-sm mt-2 text-center max-w-xs">
          Choose a new password for your account.
        </p>

        <form onSubmit={handleSubmit} className="w-full max-w-sm mt-8 space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-brand-gray-700 mb-1.5">
              New Password
            </label>
            <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors bg-white">
              <div className="flex items-center pl-3 pr-2">
                <Lock className="w-4 h-4 text-brand-gray-400" />
              </div>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 px-2 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="p-3 text-brand-gray-400 hover:text-brand-black transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-semibold text-brand-gray-700 mb-1.5">
              Confirm Password
            </label>
            <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors bg-white">
              <div className="flex items-center pl-3 pr-2">
                <Lock className="w-4 h-4 text-brand-gray-400" />
              </div>
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="flex-1 px-2 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((value) => !value)}
                className="p-3 text-brand-gray-400 hover:text-brand-black transition-colors"
                aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3.5 rounded-xl text-sm hover:bg-brand-yellow-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
