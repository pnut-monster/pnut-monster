"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, ArrowLeft } from "lucide-react";

export default function VerifyPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  useEffect(() => {
    const storedEmail = sessionStorage.getItem("pnut_verify_email");
    if (!storedEmail) {
      router.replace("/login");
      return;
    }
    setEmail(storedEmail);
  }, [router]);

  return (
    <div className="min-h-dvh bg-brand-cream flex flex-col">
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

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 bg-brand-yellow/20 rounded-2xl flex items-center justify-center mb-6">
          <Mail className="w-8 h-8 text-brand-yellow-dark" />
        </div>

        <h1 className="font-heading text-2xl font-bold text-brand-black text-center">
          Check your email
        </h1>
        <p className="text-brand-gray-500 text-sm mt-2 text-center max-w-xs">
          We&apos;ve sent a verification link to{" "}
          {email ? (
            <span className="font-semibold text-brand-black">{email}</span>
          ) : (
            "your email"
          )}
          . Please check your inbox and click the link to verify your account.
        </p>

        <p className="text-brand-gray-400 text-xs mt-4 text-center max-w-xs">
          Didn&apos;t receive the email? Check your spam folder or try signing up again.
        </p>

        <Link
          href="/login"
          className="mt-8 bg-brand-yellow text-brand-black font-bold py-3 px-8 rounded-xl text-sm hover:bg-brand-yellow-dark transition-colors"
        >
          Back to Login
        </Link>
      </div>
    </div>
  );
}
