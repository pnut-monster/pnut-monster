"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, User, ArrowRight, Loader2, Eye, EyeOff, Phone, CheckSquare, Square } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [agreedTnc, setAgreedTnc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    window.location.assign("/auth/google?next=/");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!agreedTnc) {
      toast.error("Please agree to the Terms & Privacy Policy");
      return;
    }
    const cleanedPhone = phone.replace(/\D/g, "");
    if (phone && cleanedPhone.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      // If email confirmation is required, redirect to verify page
      if (data.user && !data.session) {
        toast.success("Signup successful. Please check your email to verify your account.");
        sessionStorage.setItem("pnut_verify_email", email.trim());
        router.push("/verify");
      } else {
        // Auto-logged in (email confirmation disabled)
        toast.success("Account created! Welcome aboard!");
        router.replace("/profile-setup");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#FAFBFC] flex flex-col">
      {/* Top section with brand */}
      <div className="flex-shrink-0 pt-10 pb-4 px-6 text-center">
        <Image
          src="/logo.webp"
          alt="PNUT MONSTER"
          width={96}
          height={96}
          priority
          className="mx-auto mb-1 object-contain"
        />
        <p className="text-brand-gray-500 mt-1 text-sm">Healthy never tasted this fun!</p>
      </div>

      {/* Form section */}
      <div className="flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-6 shadow-lg">
        <div className="mb-1">
          <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider">SIGN UP</p>
        </div>
        <h2 className="font-heading text-2xl font-bold text-brand-black mb-1">
          Create your account
        </h2>
        <p className="text-brand-gray-600 text-sm mb-6">
          Join the PNUT MONSTER family
        </p>

        <form onSubmit={handleSignUp} className="space-y-4">
          {/* Full Name input */}
          <div>
            <label
              htmlFor="fullName"
              className="block text-xs font-bold text-brand-gray-500 uppercase tracking-wider mb-2"
            >
              Full Name
            </label>
            <div className="flex items-center border border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors bg-white">
              <div className="flex items-center pl-3 pr-2">
                <User className="w-4 h-4 text-brand-gray-400" />
              </div>
              <input
                id="fullName"
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="flex-1 px-2 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400"
                autoComplete="name"
              />
            </div>
          </div>

          {/* Email input */}
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-bold text-brand-gray-500 uppercase tracking-wider mb-2"
            >
              Email Address
            </label>
            <div className="flex items-center border border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors bg-white">
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

          {/* Password input */}
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-bold text-brand-gray-500 uppercase tracking-wider mb-2"
            >
              Password
            </label>
            <div className="flex items-center border border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors bg-white">
              <div className="flex items-center pl-3 pr-2">
                <Lock className="w-4 h-4 text-brand-gray-400" />
              </div>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 px-2 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400"
                autoComplete="new-password"
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="pr-3 pl-2"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4 text-brand-gray-400" />
                ) : (
                  <Eye className="w-4 h-4 text-brand-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Confirm Password input */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-bold text-brand-gray-500 uppercase tracking-wider mb-2"
            >
              Confirm Password
            </label>
            <div className="flex items-center border border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors bg-white">
              <div className="flex items-center pl-3 pr-2">
                <Lock className="w-4 h-4 text-brand-gray-400" />
              </div>
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="flex-1 px-2 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="pr-3 pl-2"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-4 h-4 text-brand-gray-400" />
                ) : (
                  <Eye className="w-4 h-4 text-brand-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Number */}
          <div>
            <label htmlFor="phone" className="block text-sm font-semibold text-brand-gray-700 mb-1.5">
              Mobile Number <span className="text-brand-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center border border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors bg-white">
              <div className="flex items-center gap-1.5 pl-3 pr-2 border-r border-brand-gray-200">
                <Phone className="w-4 h-4 text-brand-gray-400" />
                <span className="text-sm font-semibold text-brand-gray-600">+91</span>
              </div>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="flex-1 px-3 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400"
              />
            </div>
          </div>

          {/* T&C Agreement */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setAgreedTnc(!agreedTnc)}
              className="flex items-start gap-3 text-left w-full"
            >
              {agreedTnc ? (
                <CheckSquare className="w-5 h-5 text-brand-yellow-dark flex-shrink-0 mt-0.5" />
              ) : (
                <Square className="w-5 h-5 text-brand-gray-400 flex-shrink-0 mt-0.5" />
              )}
              <span className="text-xs text-brand-gray-500 leading-relaxed">
                I agree to the{" "}
                <span className="font-semibold text-brand-black underline">Terms & Conditions</span>{" "}
                and{" "}
                <span className="font-semibold text-brand-black underline">Privacy Policy</span>{" "}
                of PNUT MONSTER.
              </span>
            </button>
          </div>

          {/* Create Account button */}
          <button
            type="submit"
            disabled={loading || !fullName.trim() || !email.trim() || !password || !confirmPassword || !agreedTnc}
            className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3.5 rounded-xl text-sm hover:bg-brand-yellow-dark hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Create Account
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-brand-gray-200" />
          <span className="text-xs text-brand-gray-400 font-medium">or sign up with</span>
          <div className="flex-1 h-px bg-brand-gray-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignUp}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 border border-brand-gray-200 py-3 rounded-xl text-sm font-semibold text-brand-gray-700 hover:bg-brand-gray-50 hover:shadow-md transition-all bg-white disabled:opacity-50"
        >
          {googleLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {/* Sign In link */}
        <p className="text-center text-sm text-brand-gray-500 mt-6">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-brand-yellow-dark hover:underline"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
