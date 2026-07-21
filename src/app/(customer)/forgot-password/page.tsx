"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "otp" | "password" | "complete";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Please enter your email address");
      return false;
    }

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      toast.error(result?.error || "Could not send the OTP");
      return false;
    }

    setEmail(normalizedEmail);
    setStep("otp");
    toast.success("OTP sent to your email");
    return true;
  };

  const handleSendOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await sendOtp();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otp.length !== 6) {
      toast.error("Enter the 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "recovery",
      });

      if (error) {
        toast.error("The OTP is invalid or has expired.");
        return;
      }

      setStep("password");
      toast.success("OTP verified");
    } catch {
      toast.error("Could not verify the OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
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

      await supabase.auth.signOut();
      setStep("complete");
      toast.success("Password updated successfully");
    } catch {
      toast.error("Could not update your password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    setLoading(true);
    try {
      if (await sendOtp()) setOtp("");
    } catch {
      toast.error("Could not resend the OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "complete") {
    return (
      <div className="min-h-dvh bg-brand-cream flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 bg-brand-green/20 rounded-2xl flex items-center justify-center mb-6">
          <CheckCircle className="w-8 h-8 text-brand-green" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-brand-black text-center mb-2">Password updated</h1>
        <p className="text-brand-gray-500 text-sm text-center max-w-xs mb-8">You can now sign in with your new password.</p>
        <Link href="/login" className="bg-brand-yellow text-brand-black font-bold py-3 px-8 rounded-xl text-sm hover:bg-brand-yellow-dark transition-colors">Back to Login</Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-brand-cream flex flex-col">
      <div className="px-4 pt-4">
        <button type="button" onClick={() => step === "email" ? router.back() : setStep("email")} className="p-2 rounded-lg hover:bg-white/60 transition-colors" aria-label="Go back">
          <ArrowLeft className="w-5 h-5 text-brand-black" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center px-6 pt-10">
        <Image src="/logo.webp" alt="PNUT MONSTER" width={80} height={80} priority className="mb-4 object-contain" />
        <h1 className="font-heading text-2xl font-bold text-brand-black text-center">
          {step === "email" ? "Forgot your password?" : step === "otp" ? "Enter verification code" : "Create a new password"}
        </h1>
        <p className="text-brand-gray-500 text-sm mt-2 text-center max-w-xs">
          {step === "email" && "Enter your registered email and we'll send a 6-digit OTP."}
          {step === "otp" && <>We sent a 6-digit OTP to <span className="font-semibold text-brand-black">{email}</span>.</>}
          {step === "password" && "Your identity is verified. Choose a secure new password."}
        </p>

        {step === "email" && (
          <form onSubmit={handleSendOtp} className="w-full max-w-sm mt-8 space-y-4">
            <FieldLabel htmlFor="email">Email Address</FieldLabel>
            <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-yellow bg-white">
              <Mail className="w-4 h-4 text-brand-gray-400 ml-3" />
              <input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" className="flex-1 px-3 py-3 text-sm bg-transparent outline-none" />
            </div>
            <SubmitButton loading={loading} disabled={!email.trim()}>Send OTP</SubmitButton>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="w-full max-w-sm mt-8 space-y-4">
            <FieldLabel htmlFor="otp">6-digit OTP</FieldLabel>
            <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-yellow bg-white">
              <ShieldCheck className="w-4 h-4 text-brand-gray-400 ml-3" />
              <input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="flex-1 px-3 py-3 text-center tracking-[0.5em] font-bold bg-transparent outline-none" />
            </div>
            <SubmitButton loading={loading} disabled={otp.length !== 6}>Verify OTP</SubmitButton>
            <button type="button" onClick={resendOtp} disabled={loading} className="w-full text-sm font-semibold text-brand-yellow-dark hover:underline disabled:opacity-50">Resend OTP</button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={handleUpdatePassword} className="w-full max-w-sm mt-8 space-y-4">
            <FieldLabel htmlFor="password">New Password</FieldLabel>
            <PasswordInput id="password" value={password} onChange={setPassword} show={showPassword} toggle={() => setShowPassword((value) => !value)} />
            <FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
            <PasswordInput id="confirmPassword" value={confirmPassword} onChange={setConfirmPassword} show={showPassword} toggle={() => setShowPassword((value) => !value)} />
            <SubmitButton loading={loading} disabled={!password || !confirmPassword}>Update Password</SubmitButton>
          </form>
        )}

        <Link href="/login" className="mt-6 text-sm font-semibold text-brand-yellow-dark hover:underline">Back to Login</Link>
      </div>
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="block text-sm font-semibold text-brand-gray-700 mb-1.5">{children}</label>;
}

function SubmitButton({ loading, disabled, children }: { loading: boolean; disabled: boolean; children: React.ReactNode }) {
  return <button type="submit" disabled={loading || disabled} className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3.5 rounded-xl text-sm hover:bg-brand-yellow-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : children}</button>;
}

function PasswordInput({ id, value, onChange, show, toggle }: { id: string; value: string; onChange: (value: string) => void; show: boolean; toggle: () => void }) {
  return (
    <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-yellow bg-white">
      <Lock className="w-4 h-4 text-brand-gray-400 ml-3" />
      <input id={id} type={show ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="new-password" placeholder="At least 8 characters" className="flex-1 px-3 py-3 text-sm bg-transparent outline-none" />
      <button type="button" onClick={toggle} className="p-3 text-brand-gray-400" aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
    </div>
  );
}
