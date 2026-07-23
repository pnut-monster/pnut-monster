"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Gift, ArrowRight, Loader2, KeyRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

export default function ReferralClaimPage() {
  const router = useRouter();
  const [showInput, setShowInput] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSkip = () => {
    router.replace("/");
  };

  const handleApplyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("Please enter a referral code");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "apply_referral_code" as never,
        { p_referral_code: trimmed } as never
      );
      const result = data as { success?: boolean; message?: string } | null;

      if (error) {
        toast.error(error.message || "Something went wrong");
        return;
      }

      if (result?.success === false) {
        toast.error(result.message || "Could not apply referral code");
        return;
      }

      toast.success("Referral code applied! Welcome rewards unlocked!");
      router.replace("/");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#FAFBFC] flex flex-col">
      <div className="max-w-lg mx-auto px-6 py-8 flex-1 flex flex-col">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <Image
            src="/logo.webp"
            alt="PNUT MONSTER"
            width={80}
            height={80}
            priority
            className="mx-auto mb-4 object-contain"
          />
          <div className="w-16 h-16 bg-brand-yellow/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Gift className="w-8 h-8 text-brand-yellow-dark" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-brand-black">
            Do you have a referral code?
          </h1>
          <p className="text-brand-gray-500 text-sm mt-2 max-w-xs mx-auto">
            If someone referred you, enter their code to unlock bonus rewards for both of you!
          </p>
        </div>

        {/* Action area */}
        <div className="flex-1 flex flex-col justify-center">
          {!showInput ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowInput(true)}
                className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3.5 rounded-xl text-sm hover:bg-brand-yellow-dark hover:shadow-lg transition-all shadow-md"
              >
                <KeyRound className="w-4 h-4" />
                Yes, I have a code
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="w-full flex items-center justify-center gap-2 border-2 border-brand-gray-200 text-brand-gray-600 font-semibold py-3.5 rounded-xl text-sm hover:bg-brand-gray-50 transition-colors"
              >
                No, skip for now
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleApplyCode} className="space-y-4">
              <div>
                <label
                  htmlFor="referralCode"
                  className="block text-xs font-bold text-brand-gray-500 uppercase tracking-wider mb-2"
                >
                  Referral Code
                </label>
                <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors bg-white">
                  <div className="flex items-center pl-3 pr-2">
                    <KeyRound className="w-4 h-4 text-brand-gray-400" />
                  </div>
                  <input
                    id="referralCode"
                    type="text"
                    placeholder="Enter referral code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="flex-1 px-2 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400 uppercase tracking-wider font-semibold"
                    autoComplete="off"
                    autoFocus
                  />
                  {code && (
                    <button
                      type="button"
                      onClick={() => setCode("")}
                      className="pr-3 pl-1"
                    >
                      <X className="w-4 h-4 text-brand-gray-400" />
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3.5 rounded-xl text-sm hover:bg-brand-yellow-dark hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Claim Rewards
                    <Gift className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSkip}
                disabled={loading}
                className="w-full text-sm font-semibold text-brand-gray-500 hover:text-brand-black transition-colors py-2"
              >
                Skip for now
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[10px] text-brand-gray-400 mt-8">
          You can also apply a referral code later from your profile.
        </p>
      </div>
    </div>
  );
}
