"use client";

import { useState } from "react";
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
        <img src="/logo.webp" alt="PNUT MONSTER" className="w-24 h-24 mx-auto mb-1 object-contain" />
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
