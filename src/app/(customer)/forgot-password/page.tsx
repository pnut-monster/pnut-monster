"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, ArrowLeft, Loader2, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: window.location.origin + "/reset-password",
        }
      );

      if (error) {
        toast.error(error.message);
        return;
      }

      setSent(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-dvh bg-brand-cream flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 bg-brand-green/20 rounded-2xl flex items-center justify-center mb-6">
          <CheckCircle className="w-8 h-8 text-brand-green" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-brand-black text-center mb-2">
          Check your email
        </h1>
        <p className="text-brand-gray-500 text-sm text-center max-w-xs mb-8">
          We&apos;ve sent a password reset link to{" "}
          <span className="font-semibold text-brand-black">{email}</span>
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

  return (
    <div className="min-h-dvh bg-brand-cream flex flex-col">
      {/* Back button */}
      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-white/60 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-brand-black" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center px-6 pt-12">
        <Image
          src="/logo.webp"
          alt="PNUT MONSTER"
          width={80}
          height={80}
          priority
          className="mb-4 object-contain"
        />

        <h1 className="font-heading text-2xl font-bold text-brand-black text-center">
          Forgot your password?
        </h1>
        <p className="text-brand-gray-500 text-sm mt-2 text-center max-w-xs">
          Enter your email address and we&apos;ll send you a link to reset your
          password.
        </p>

        <form
          onSubmit={handleResetPassword}
          className="w-full max-w-sm mt-8 space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-semibold text-brand-gray-700 mb-1.5"
            >
              Email Address
            </label>
            <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors">
              <div className="flex items-center pl-3 pr-2">
                <Mail className="w-4 h-4 text-brand-gray-400" />
              </div>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-2 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400"
                autoComplete="email"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3.5 rounded-xl text-sm hover:bg-brand-yellow-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Send Reset Link"
            )}
          </button>
        </form>

        <Link
          href="/login"
          className="mt-6 text-sm font-semibold text-brand-yellow-dark hover:underline"
        >
          Back to Login
        </Link>
      </div>
    </div>
  );
}
