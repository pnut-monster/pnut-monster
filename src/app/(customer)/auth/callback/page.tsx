"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");

      if (!code) {
        // No code param — might be a hash-based redirect (implicit flow)
        // Supabase JS client handles hash fragments automatically on init
        // Just wait a moment for the session to be established, then redirect
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          router.replace("/");
        } else {
          setError("No authentication code found.");
        }
        return;
      }

      try {
        const supabase = createClient();
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }

        router.replace("/");
      } catch {
        setError("Authentication failed. Please try again.");
      }
    };

    handleCallback();
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="min-h-dvh bg-brand-cream flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-6">
          <span className="text-2xl">!</span>
        </div>
        <h1 className="font-heading text-xl font-bold text-brand-black text-center mb-2">
          Authentication Failed
        </h1>
        <p className="text-brand-gray-500 text-sm text-center mb-6">
          {error}
        </p>
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="bg-brand-yellow text-brand-black font-bold py-3 px-8 rounded-xl text-sm hover:bg-brand-yellow-dark transition-colors"
        >
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-brand-cream flex flex-col items-center justify-center px-6">
      <Loader2 className="w-10 h-10 text-brand-yellow animate-spin mb-4" />
      <p className="text-brand-gray-500 text-sm">Signing you in...</p>
    </div>
  );
}
