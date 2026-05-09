"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, ArrowRight, Loader2, Eye, EyeOff, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

type AuthMethod = "password" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<AuthMethod>("password");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { toast.error("Please enter your email"); return; }
    if (!password) { toast.error("Please enter your password"); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { toast.error(error.message); return; }
      toast.success("Welcome back!");
      router.replace("/");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { toast.error("Please enter your email"); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) { toast.error(error.message); return; }
      setOtpSent(true);
      toast.success("OTP sent to your email!");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) { toast.error("Please enter the OTP"); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: "email",
      });
      if (error) { toast.error(error.message); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single() as { data: { full_name: string | null } | null };
        if (!profile?.full_name) { router.replace("/profile-setup"); return; }
      }

      toast.success("Welcome back!");
      router.replace("/");
    } catch {
      toast.error("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/auth/callback" },
      });
      if (error) toast.error(error.message);
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  };

  const switchMethod = (m: AuthMethod) => {
    setMethod(m);
    setOtpSent(false);
    setOtp("");
    setPassword("");
  };

  return (
    <div className="min-h-dvh bg-brand-cream flex flex-col">
      {/* Brand */}
      <div className="flex-shrink-0 pt-12 pb-6 px-6 text-center">
        <img src="/logo.webp" alt="PNUT MONSTER" className="w-28 h-28 mx-auto mb-2 object-contain" />
        <p className="text-brand-gray-500 mt-1 text-sm">Healthy never tasted this fun!</p>
      </div>

      {/* Form */}
      <div className="flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <h2 className="font-heading text-xl font-bold text-brand-black mb-1">Welcome back</h2>
        <p className="text-brand-gray-500 text-sm mb-6">Sign in to your account</p>

        {/* Toggle: Password / Email OTP */}
        <div className="flex bg-brand-gray-100 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => switchMethod("password")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              method === "password" ? "bg-white text-brand-black shadow-sm" : "text-brand-gray-500"
            }`}
          >
            <Lock className="w-4 h-4" /> Password
          </button>
          <button
            type="button"
            onClick={() => switchMethod("otp")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              method === "otp" ? "bg-white text-brand-black shadow-sm" : "text-brand-gray-500"
            }`}
          >
            <KeyRound className="w-4 h-4" /> Email OTP
          </button>
        </div>

        {/* Shared email field */}
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-semibold text-brand-gray-700 mb-1.5">
            Email Address
          </label>
          <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors" suppressHydrationWarning>
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
              disabled={otpSent}
            />
          </div>
        </div>

        {/* PASSWORD METHOD */}
        {method === "password" && (
          <form onSubmit={handlePasswordSignIn} className="space-y-4" suppressHydrationWarning>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-semibold text-brand-gray-700">Password</label>
                <Link href="/forgot-password" className="text-xs font-semibold text-brand-yellow-dark hover:underline">Forgot Password?</Link>
              </div>
              <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors" suppressHydrationWarning>
                <div className="flex items-center pl-3 pr-2">
                  <Lock className="w-4 h-4 text-brand-gray-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 px-2 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="pr-3 pl-2">
                  {showPassword ? <EyeOff className="w-4 h-4 text-brand-gray-400" /> : <Eye className="w-4 h-4 text-brand-gray-400" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3.5 rounded-xl text-sm hover:bg-brand-yellow-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        )}

        {/* EMAIL OTP METHOD — send step */}
        {method === "otp" && !otpSent && (
          <form onSubmit={handleSendOtp} className="space-y-4" suppressHydrationWarning>
            <p className="text-xs text-brand-gray-400">We&apos;ll send a one-time code to your email</p>
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3.5 rounded-xl text-sm hover:bg-brand-yellow-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Send OTP <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        )}

        {/* EMAIL OTP METHOD — verify step */}
        {method === "otp" && otpSent && (
          <form onSubmit={handleVerifyOtp} className="space-y-4" suppressHydrationWarning>
            <div className="bg-brand-green/10 border border-brand-green/20 rounded-xl p-3">
              <p className="text-xs text-brand-green-dark font-semibold">OTP sent to {email}</p>
            </div>
            <div>
              <label htmlFor="otp" className="block text-sm font-semibold text-brand-gray-700 mb-1.5">Enter OTP</label>
              <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors" suppressHydrationWarning>
                <div className="flex items-center pl-3 pr-2">
                  <KeyRound className="w-4 h-4 text-brand-gray-400" />
                </div>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter code from email"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="flex-1 px-2 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400 tracking-widest font-semibold"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !otp.trim()}
              className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3.5 rounded-xl text-sm hover:bg-brand-yellow-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Verify & Sign In <ArrowRight className="w-4 h-4" /></>}
            </button>
            <button
              type="button"
              onClick={() => { setOtpSent(false); setOtp(""); }}
              className="w-full text-sm font-semibold text-brand-gray-500 hover:text-brand-black transition-colors"
            >
              Change email or resend
            </button>
          </form>
        )}

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-brand-gray-200" />
          <span className="text-xs text-brand-gray-400 font-medium">or continue with</span>
          <div className="flex-1 h-px bg-brand-gray-200" />
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 border-2 border-brand-gray-200 py-3 rounded-xl text-sm font-semibold text-brand-gray-700 hover:bg-brand-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>

        <p className="text-center text-sm text-brand-gray-500 mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold text-brand-yellow-dark hover:underline">Sign Up</Link>
        </p>

        <p className="text-center text-xs text-brand-gray-400 mt-4">
          By continuing, you agree to our <span className="underline">Terms of Service</span> and <span className="underline">Privacy Policy</span>
        </p>
      </div>
    </div>
  );
}
