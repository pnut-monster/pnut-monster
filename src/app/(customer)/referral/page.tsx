"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Copy,
  Check,
  Share2,
  MessageCircle,
  Users,
  ArrowRight,
  Gift,
  Star,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/helpers";
import { Spinner } from "@/components/ui/spinner";
import type { Profile, Campaign, Json } from "@/lib/supabase/types";
import toast from "react-hot-toast";

interface ReferralCampaignConfig {
  referrer_bonus_points?: number;
  referee_bonus_points?: number;
  referrer_wallet_bonus?: number;
  referee_wallet_bonus?: number;
  description?: string;
}

export default function ReferralPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [referralCampaign, setReferralCampaign] = useState<Campaign | null>(
    null
  );
  const [friendsReferred, setFriendsReferred] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch profile for referral code
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      const prof = profileData as Profile | null;
      setProfile(prof);

      // Count friends referred (profiles where referred_by = current user id)
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("referred_by", user.id);
      setFriendsReferred(count ?? 0);

      // Fetch active referral campaign
      const now = new Date().toISOString();
      const { data: campaignData } = await supabase
        .from("campaigns")
        .select("*")
        .eq("type", "referral")
        .eq("is_active", true)
        .lte("starts_at", now)
        .gte("ends_at", now)
        .limit(1)
        .single();
      const camp = campaignData as Campaign | null;
      setReferralCampaign(camp);
    } catch (err) {
      console.error("Failed to fetch referral data:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const referralCode = profile?.referral_code ?? "";
  const referralUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/login?ref=${referralCode}`
      : "";

  const referralMessage = `Hey! Try PNUT MONSTER for amazing healthy food! Use my referral code ${referralCode} to sign up and we both earn rewards. ${referralUrl}`;

  const handleCopyCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      toast.success("Referral code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy code");
    }
  };

  const handleCopyLink = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralMessage);
      setCopiedLink(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "PNUT MONSTER - Healthy never tasted this fun!",
          text: referralMessage,
          url: referralUrl,
        });
      } catch {
        // User cancelled or share failed, fall back to copy
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  const handleWhatsAppShare = () => {
    const encoded = encodeURIComponent(referralMessage);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const campaignConfig = referralCampaign
    ? (referralCampaign.config as ReferralCampaignConfig)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-brand-gray-100 transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5 text-brand-gray-600" />
        </button>
        <h1 className="font-heading text-xl font-bold text-brand-black">
          Refer & Earn
        </h1>
      </div>

      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-brand-yellow/20 via-brand-yellow/10 to-green-50 rounded-2xl p-6 overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-brand-yellow/20 rounded-full" />
        <div className="absolute bottom-2 -left-4 w-16 h-16 bg-green-200/30 rounded-full" />
        <div className="absolute top-10 right-12 w-8 h-8 bg-purple-200/40 rounded-full" />

        <div className="relative z-10 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-brand-yellow/30 flex items-center justify-center mb-4">
            <Gift className="w-8 h-8 text-brand-yellow-dark" />
          </div>
          <h2 className="font-heading text-2xl font-bold text-brand-black">
            Share the healthy love!
          </h2>
          <p className="text-sm text-brand-gray-500 mt-2">
            Invite friends to PNUT MONSTER and you both earn rewards
          </p>
        </div>
      </div>

      {/* How It Works */}
      <div>
        <h3 className="font-heading text-base font-bold text-brand-black mb-4">
          How it works
        </h3>
        <div className="space-y-3">
          {[
            {
              step: 1,
              text: "Share your code with friends",
              color: "bg-brand-yellow text-brand-black",
            },
            {
              step: 2,
              text: "They sign up & order",
              color: "bg-green-500 text-white",
            },
            {
              step: 3,
              text: "You both earn rewards!",
              color: "bg-purple-500 text-white",
            },
          ].map((item, index) => (
            <div
              key={item.step}
              className="flex items-center gap-4 bg-white rounded-xl p-4 shadow-sm border border-brand-gray-100"
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                  item.color
                )}
              >
                {item.step}
              </div>
              <p className="text-sm font-semibold text-brand-black flex-1">
                {item.text}
              </p>
              {index < 2 && (
                <ArrowRight className="w-4 h-4 text-brand-gray-300 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Referral Code Card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-brand-gray-100 space-y-4">
        <h3 className="font-heading text-base font-bold text-brand-black text-center">
          Your Referral Code
        </h3>

        {/* Code Display */}
        <div className="bg-brand-gray-50 rounded-xl p-4 border-2 border-dashed border-brand-gray-200 text-center">
          <p className="font-heading text-2xl font-bold text-brand-black tracking-widest">
            {referralCode || "---"}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleCopyCode}
            disabled={!referralCode}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all",
              copied
                ? "bg-green-100 text-green-700 border-2 border-green-200"
                : "bg-brand-gray-100 text-brand-black border-2 border-brand-gray-200 hover:border-brand-gray-300"
            )}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy Code
              </>
            )}
          </button>

          <button
            onClick={handleShare}
            disabled={!referralCode}
            className="flex-1 flex items-center justify-center gap-2 bg-brand-yellow text-brand-black py-3 rounded-xl font-bold text-sm hover:bg-brand-yellow-dark transition-colors"
          >
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>
      </div>

      {/* Share Buttons Row */}
      <div className="flex gap-3">
        <button
          onClick={handleWhatsAppShare}
          disabled={!referralCode}
          className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-[#1da851] transition-colors disabled:opacity-50"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </button>

        <button
          onClick={handleCopyLink}
          disabled={!referralCode}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all",
            copiedLink
              ? "bg-green-100 text-green-700 border-2 border-green-200"
              : "bg-brand-gray-100 text-brand-black border-2 border-brand-gray-200 hover:border-brand-gray-300"
          )}
        >
          {copiedLink ? (
            <>
              <Check className="w-4 h-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy Link
            </>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-brand-gray-100 text-center">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-2">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <p className="font-heading text-2xl font-bold text-brand-black">
            {friendsReferred}
          </p>
          <p className="text-xs text-brand-gray-500 font-medium mt-0.5">
            Friends Referred
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-brand-gray-100 text-center">
          <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-2">
            <Star className="w-5 h-5 text-brand-yellow-dark" />
          </div>
          <p className="font-heading text-2xl font-bold text-brand-black">
            {friendsReferred *
              (campaignConfig?.referrer_bonus_points ??
                campaignConfig?.referrer_wallet_bonus ??
                0)}
          </p>
          <p className="text-xs text-brand-gray-500 font-medium mt-0.5">
            Rewards Earned
          </p>
        </div>
      </div>

      {/* Active Referral Campaign */}
      {referralCampaign && campaignConfig && (
        <div className="bg-gradient-to-br from-purple-50 to-brand-yellow/10 rounded-2xl p-5 border border-purple-100">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="w-5 h-5 text-purple-600" />
            <h3 className="font-heading text-base font-bold text-brand-black">
              Active Referral Bonus
            </h3>
          </div>

          <p className="text-sm text-brand-gray-600 mb-3">
            {referralCampaign.name}
          </p>

          <div className="space-y-2">
            {campaignConfig.referrer_bonus_points !== undefined &&
              campaignConfig.referrer_bonus_points > 0 && (
                <div className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2">
                  <Star className="w-4 h-4 text-brand-yellow-dark shrink-0" />
                  <p className="text-sm text-brand-black">
                    You get{" "}
                    <span className="font-bold">
                      {campaignConfig.referrer_bonus_points} pts
                    </span>{" "}
                    per referral
                  </p>
                </div>
              )}

            {campaignConfig.referee_bonus_points !== undefined &&
              campaignConfig.referee_bonus_points > 0 && (
                <div className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2">
                  <Star className="w-4 h-4 text-green-600 shrink-0" />
                  <p className="text-sm text-brand-black">
                    Your friend gets{" "}
                    <span className="font-bold">
                      {campaignConfig.referee_bonus_points} pts
                    </span>
                  </p>
                </div>
              )}

            {campaignConfig.referrer_wallet_bonus !== undefined &&
              campaignConfig.referrer_wallet_bonus > 0 && (
                <div className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2">
                  <Star className="w-4 h-4 text-brand-yellow-dark shrink-0" />
                  <p className="text-sm text-brand-black">
                    You get{" "}
                    <span className="font-bold">
                      &#8377;{campaignConfig.referrer_wallet_bonus}
                    </span>{" "}
                    wallet bonus per referral
                  </p>
                </div>
              )}

            {campaignConfig.referee_wallet_bonus !== undefined &&
              campaignConfig.referee_wallet_bonus > 0 && (
                <div className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2">
                  <Star className="w-4 h-4 text-green-600 shrink-0" />
                  <p className="text-sm text-brand-black">
                    Your friend gets{" "}
                    <span className="font-bold">
                      &#8377;{campaignConfig.referee_wallet_bonus}
                    </span>{" "}
                    wallet bonus
                  </p>
                </div>
              )}
          </div>

          <p className="text-xs text-brand-gray-400 mt-3">
            Valid until{" "}
            {new Date(referralCampaign.ends_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
      )}
    </div>
  );
}
