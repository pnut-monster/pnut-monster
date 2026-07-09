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
  Gift,
  Star,
  TrendingUp,
  Award,
  Clock,
  CheckCircle2,
  Zap,
  Heart,
  Sparkles,
  DollarSign,
  UserPlus,
  PartyPopper,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency } from "@/lib/utils/helpers";
import { Spinner } from "@/components/ui/spinner";
import type { Profile, Campaign } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";

interface ReferralCampaignConfig {
  referrer_bonus_points?: number;
  referee_bonus_points?: number;
  referrer_wallet_bonus?: number;
  referee_wallet_bonus?: number;
  description?: string;
}

interface ReferredUser {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  hasOrdered: boolean;
}

interface ReferralStats {
  totalReferred: number;
  convertedUsers: number;
  pendingUsers: number;
  totalPointsEarned: number;
  totalWalletEarned: number;
  thisMonthReferrals: number;
  thisWeekReferrals: number;
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const confettiTargets = Array.from({ length: 30 }, (_, i) => ({
  x: `${((i * 37) % 100).toString()}vw`,
  y: `${((i * 61) % 100).toString()}vh`,
  rotate: (i * 47) % 360,
}));

const campaignSparkles = Array.from({ length: 20 }, (_, i) => ({
  left: `${((i * 29 + 11) % 100).toString()}%`,
  top: `${((i * 53 + 17) % 100).toString()}%`,
}));

export default function ReferralPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [referralCampaign, setReferralCampaign] = useState<Campaign | null>(null);
  const [referredUsers, setReferredUsers] = useState<ReferredUser[]>([]);
  const [stats, setStats] = useState<ReferralStats>({
    totalReferred: 0,
    convertedUsers: 0,
    pendingUsers: 0,
    totalPointsEarned: 0,
    totalWalletEarned: 0,
    thisMonthReferrals: 0,
    thisWeekReferrals: 0,
  });
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      const prof = profileData as Profile | null;
      setProfile(prof);

      const now = new Date().toISOString();
      const { data: campaignData } = await supabase
        .from("campaigns")
        .select("*")
        .eq("type", "referral")
        .eq("is_active", true)
        .lte("starts_at", now)
        .gte("ends_at", now)
        .limit(1)
        .maybeSingle();
      const camp = campaignData as Campaign | null;
      setReferralCampaign(camp);

      setLoadingDetails(true);
      const { data: referredData } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, created_at")
        .eq("referred_by", user.id)
        .order("created_at", { ascending: false });

      if (referredData) {
        const referredRows = (referredData ?? []) as Pick<
          Profile,
          "id" | "full_name" | "email" | "avatar_url" | "created_at"
        >[];
        const userIds = referredRows.map((u) => u.id);
        const { data: ordersData } = await supabase
          .from("orders")
          .select("user_id")
          .in("user_id", userIds)
          .eq("status", "picked_up");

        const orderRows = (ordersData ?? []) as { user_id: string }[];
        const usersWithOrders = new Set(
          orderRows.map((o) => o.user_id)
        );

        const enrichedUsers: ReferredUser[] = referredRows.map((u) => ({
          ...u,
          hasOrdered: usersWithOrders.has(u.id),
        }));

        setReferredUsers(enrichedUsers);

        const totalReferred = enrichedUsers.length;
        const convertedUsers = enrichedUsers.filter((u) => u.hasOrdered).length;
        const pendingUsers = totalReferred - convertedUsers;

        const campaignConfig = camp?.config as ReferralCampaignConfig | null;
        const pointsPerReferral = campaignConfig?.referrer_bonus_points ?? 0;
        const walletPerReferral = campaignConfig?.referrer_wallet_bonus ?? 0;

        const totalPointsEarned = convertedUsers * pointsPerReferral;
        const totalWalletEarned = convertedUsers * walletPerReferral;

        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);

        const thisWeek = new Date();
        thisWeek.setDate(thisWeek.getDate() - 7);
        thisWeek.setHours(0, 0, 0, 0);

        const thisMonthReferrals = enrichedUsers.filter(
          (u) => new Date(u.created_at) >= thisMonth
        ).length;

        const thisWeekReferrals = enrichedUsers.filter(
          (u) => new Date(u.created_at) >= thisWeek
        ).length;

        setStats({
          totalReferred,
          convertedUsers,
          pendingUsers,
          totalPointsEarned,
          totalWalletEarned,
          thisMonthReferrals,
          thisWeekReferrals,
        });
      }
    } catch (err) {
      console.error("Failed to fetch referral data:", err);
      toast.error("Failed to load referral data");
    } finally {
      setLoading(false);
      setLoadingDetails(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const referralCode = profile?.referral_code ?? "";
  const referralUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/register?ref=${referralCode}`
      : "";

  const referralMessage = `🌱 Hey! I'm loving PNUT MONSTER - healthy food that actually tastes amazing!\n\nUse my code *${referralCode}* when you sign up and we'll both get awesome rewards! 🎁\n\n${referralUrl}`;

  const handleCopyCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      toast.success("Referral code copied!", {
        icon: "🎉",
      });
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
      setShowConfetti(true);
      toast.success("Referral message copied!", {
        icon: "✨",
      });
      setTimeout(() => {
        setCopiedLink(false);
        setShowConfetti(false);
      }, 3000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join PNUT MONSTER! 🌱",
          text: referralMessage,
        });
      } catch {
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

  const conversionRate =
    stats.totalReferred > 0
      ? Math.round((stats.convertedUsers / stats.totalReferred) * 100)
      : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Spinner size="lg" />
        </motion.div>
        <p className="text-sm text-brand-gray-500 mt-4">Loading your referral dashboard...</p>
      </div>
    );
  }

  return (
    <div className="pb-8 relative overflow-hidden">
      {/* Animated Background Pattern */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-yellow/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-60 -left-40 w-96 h-96 bg-brand-green/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute bottom-40 right-20 w-64 h-64 bg-purple-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
      </div>

      {/* Confetti Effect */}
      <AnimatePresence>
        {showConfetti && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
          >
            {confettiTargets.map((target, i) => (
              <motion.div
                key={i}
                initial={{
                  x: "50vw",
                  y: "50vh",
                  scale: 0,
                  rotate: 0,
                }}
                animate={{
                  x: target.x,
                  y: target.y,
                  scale: [0, 1, 0.5],
                  rotate: target.rotate,
                }}
                transition={{
                  duration: 2,
                  ease: "easeOut",
                  delay: i * 0.02,
                }}
                className="absolute w-3 h-3 rounded-full"
                style={{
                  backgroundColor: [
                    "#F5B731",
                    "#4CAF50",
                    "#9333EA",
                    "#EF4444",
                    "#3B82F6",
                  ][i % 5],
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="max-w-7xl mx-auto px-4 lg:px-8 relative z-10"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        {/* Header with Back Button */}
        <motion.div className="pt-4 pb-6" variants={fadeUp}>
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-brand-gray-600 hover:text-brand-black transition-colors group mb-4"
          >
            <div className="w-8 h-8 rounded-full bg-white border border-brand-gray-200 flex items-center justify-center group-hover:border-brand-yellow transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold">Back</span>
          </button>

          <div className="flex items-start gap-4">
            <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-3xl bg-gradient-to-br from-brand-yellow via-brand-yellow-light to-brand-orange flex items-center justify-center shadow-xl relative">
              <Gift className="w-8 h-8 lg:w-10 lg:h-10 text-white" />
              <motion.div
                className="absolute -top-2 -right-2 w-6 h-6 bg-brand-green rounded-full flex items-center justify-center shadow-lg"
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 10, -10, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  repeatDelay: 3,
                }}
              >
                <Sparkles className="w-3 h-3 text-white" />
              </motion.div>
            </div>
            <div className="flex-1">
              <h1 className="font-heading text-2xl lg:text-4xl font-bold text-brand-black mb-1">
                Refer Friends, Earn Rewards! 🎉
              </h1>
              <p className="text-sm lg:text-base text-brand-gray-600">
                Share the love for healthy food and get rewarded together
              </p>
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Main Content Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Hero Stats Cards - Bento Box Style */}
            <motion.div variants={fadeUp}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                {/* Total Referrals */}
                <motion.div
                  className="relative bg-gradient-to-br from-blue-50 to-blue-100 rounded-3xl p-5 overflow-hidden group hover:shadow-xl transition-all duration-300 cursor-pointer"
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-blue-200 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                  <div className="relative z-10">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center mb-3 shadow-lg">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
                      Total Friends
                    </p>
                    <p className="font-heading text-3xl font-bold text-blue-900">
                      {stats.totalReferred}
                    </p>
                    {stats.thisWeekReferrals > 0 && (
                      <div className="mt-2 inline-flex items-center gap-1 bg-blue-200 px-2 py-0.5 rounded-full">
                        <TrendingUp className="w-3 h-3 text-blue-700" />
                        <span className="text-[10px] font-bold text-blue-700">
                          +{stats.thisWeekReferrals} this week
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Converted Users */}
                <motion.div
                  className="relative bg-gradient-to-br from-green-50 to-emerald-100 rounded-3xl p-5 overflow-hidden group hover:shadow-xl transition-all duration-300 cursor-pointer"
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-green-200 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                  <div className="relative z-10">
                    <div className="w-12 h-12 rounded-2xl bg-green-500 flex items-center justify-center mb-3 shadow-lg">
                      <CheckCircle2 className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">
                      Successful
                    </p>
                    <p className="font-heading text-3xl font-bold text-green-900">
                      {stats.convertedUsers}
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1 bg-green-200 px-2 py-0.5 rounded-full">
                      <Zap className="w-3 h-3 text-green-700" />
                      <span className="text-[10px] font-bold text-green-700">
                        {conversionRate}% rate
                      </span>
                    </div>
                  </div>
                </motion.div>

                {/* Points Earned */}
                <motion.div
                  className="relative bg-gradient-to-br from-amber-50 to-yellow-100 rounded-3xl p-5 overflow-hidden group hover:shadow-xl transition-all duration-300 cursor-pointer"
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-yellow-200 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                  <div className="relative z-10">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center mb-3 shadow-lg">
                      <Star className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">
                      Points Earned
                    </p>
                    <p className="font-heading text-3xl font-bold text-amber-900">
                      {stats.totalPointsEarned}
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1 bg-amber-200 px-2 py-0.5 rounded-full">
                      <Sparkles className="w-3 h-3 text-amber-700" />
                      <span className="text-[10px] font-bold text-amber-700">
                        Loyalty pts
                      </span>
                    </div>
                  </div>
                </motion.div>

                {/* Wallet Earned */}
                <motion.div
                  className="relative bg-gradient-to-br from-purple-50 to-violet-100 rounded-3xl p-5 overflow-hidden group hover:shadow-xl transition-all duration-300 cursor-pointer"
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-purple-200 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                  <div className="relative z-10">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center mb-3 shadow-lg">
                      <DollarSign className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-1">
                      Cash Earned
                    </p>
                    <p className="font-heading text-3xl font-bold text-purple-900">
                      {formatCurrency(stats.totalWalletEarned)}
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1 bg-purple-200 px-2 py-0.5 rounded-full">
                      <Award className="w-3 h-3 text-purple-700" />
                      <span className="text-[10px] font-bold text-purple-700">
                        In wallet
                      </span>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>

            {/* Active Campaign Banner */}
            {referralCampaign && campaignConfig && (
              <motion.div
                variants={fadeUp}
                className="relative bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 rounded-3xl p-6 lg:p-8 overflow-hidden shadow-2xl"
              >
                {/* Animated Background Pattern */}
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute top-0 left-0 w-full h-full">
                    {campaignSparkles.map((sparkle, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-2 h-2 bg-white rounded-full"
                        style={{
                          left: sparkle.left,
                          top: sparkle.top,
                        }}
                        animate={{
                          scale: [0, 1, 0],
                          opacity: [0, 1, 0],
                        }}
                        transition={{
                          duration: 3,
                          repeat: Infinity,
                          delay: i * 0.2,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                        <PartyPopper className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full mb-2">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Active Campaign
                          </span>
                        </div>
                        <h3 className="font-heading text-xl lg:text-2xl font-bold text-white">
                          {referralCampaign.name}
                        </h3>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {campaignConfig.referrer_bonus_points !== undefined &&
                      campaignConfig.referrer_bonus_points > 0 && (
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                          <Star className="w-5 h-5 text-yellow-300 mb-2" />
                          <p className="text-2xl font-heading font-bold text-white">
                            {campaignConfig.referrer_bonus_points}
                          </p>
                          <p className="text-xs text-white/80 font-medium">
                            Points for you
                          </p>
                        </div>
                      )}
                    {campaignConfig.referee_bonus_points !== undefined &&
                      campaignConfig.referee_bonus_points > 0 && (
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                          <Heart className="w-5 h-5 text-pink-300 mb-2" />
                          <p className="text-2xl font-heading font-bold text-white">
                            {campaignConfig.referee_bonus_points}
                          </p>
                          <p className="text-xs text-white/80 font-medium">
                            Points for friend
                          </p>
                        </div>
                      )}
                    {campaignConfig.referrer_wallet_bonus !== undefined &&
                      campaignConfig.referrer_wallet_bonus > 0 && (
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                          <DollarSign className="w-5 h-5 text-green-300 mb-2" />
                          <p className="text-2xl font-heading font-bold text-white">
                            {formatCurrency(campaignConfig.referrer_wallet_bonus)}
                          </p>
                          <p className="text-xs text-white/80 font-medium">
                            Cash for you
                          </p>
                        </div>
                      )}
                    {campaignConfig.referee_wallet_bonus !== undefined &&
                      campaignConfig.referee_wallet_bonus > 0 && (
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                          <Gift className="w-5 h-5 text-blue-300 mb-2" />
                          <p className="text-2xl font-heading font-bold text-white">
                            {formatCurrency(campaignConfig.referee_wallet_bonus)}
                          </p>
                          <p className="text-xs text-white/80 font-medium">
                            Cash for friend
                          </p>
                        </div>
                      )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* How It Works Section */}
            <motion.div variants={fadeUp}>
              <div className="bg-white rounded-3xl p-6 lg:p-8 shadow-lg border border-brand-gray-100">
                <h3 className="font-heading text-xl lg:text-2xl font-bold text-brand-black mb-6 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-brand-yellow" />
                  How it works
                </h3>

                <div className="relative">
                  {/* Connection Line */}
                  <div className="absolute left-6 top-12 bottom-12 w-0.5 bg-gradient-to-b from-brand-yellow via-brand-green to-purple-500 hidden lg:block" />

                  <div className="space-y-4">
                    {[
                      {
                        step: 1,
                        title: "Share Your Code",
                        description: "Copy your unique referral code or share via WhatsApp",
                        color: "from-yellow-400 to-orange-500",
                        icon: Share2,
                        emoji: "📤",
                      },
                      {
                        step: 2,
                        title: "Friend Signs Up",
                        description: "They create an account using your special code",
                        color: "from-blue-400 to-cyan-500",
                        icon: UserPlus,
                        emoji: "👤",
                      },
                      {
                        step: 3,
                        title: "First Order Placed",
                        description: "Your friend enjoys their first healthy meal",
                        color: "from-green-400 to-emerald-500",
                        icon: CheckCircle2,
                        emoji: "🥗",
                      },
                      {
                        step: 4,
                        title: "Earn Rewards Together",
                        description: "Both of you receive points and wallet bonuses!",
                        color: "from-purple-400 to-pink-500",
                        icon: PartyPopper,
                        emoji: "🎉",
                      },
                    ].map((item, index) => {
                      const Icon = item.icon;
                      return (
                        <motion.div
                          key={item.step}
                          className="relative flex items-start gap-4 lg:gap-6"
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                        >
                          {/* Step Number Circle */}
                          <div className="relative z-10 shrink-0">
                            <div className={cn(
                              "w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg",
                              item.color
                            )}>
                              <span className="text-2xl">{item.emoji}</span>
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-lg shadow-md flex items-center justify-center border-2 border-brand-gray-100">
                              <span className="text-xs font-bold text-brand-black">
                                {item.step}
                              </span>
                            </div>
                          </div>

                          {/* Content */}
                          <div className="flex-1 bg-brand-gray-50 rounded-2xl p-4 lg:p-5">
                            <h4 className="font-bold text-brand-black mb-1 flex items-center gap-2">
                              <Icon className="w-4 h-4 text-brand-gray-600" />
                              {item.title}
                            </h4>
                            <p className="text-sm text-brand-gray-600">
                              {item.description}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Referral History */}
            {referredUsers.length > 0 && (
              <motion.div variants={fadeUp}>
                <div className="bg-white rounded-3xl p-6 lg:p-8 shadow-lg border border-brand-gray-100">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-heading text-xl lg:text-2xl font-bold text-brand-black flex items-center gap-2">
                      <Users className="w-6 h-6 text-brand-blue-500" />
                      Your Referrals ({stats.totalReferred})
                    </h3>
                  </div>

                  {loadingDetails ? (
                    <div className="flex items-center justify-center py-12">
                      <Spinner />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {referredUsers.slice(0, 5).map((user, index) => (
                        <motion.div
                          key={user.id}
                          className="flex items-center gap-4 p-4 bg-gradient-to-r from-brand-gray-50 to-white rounded-2xl border border-brand-gray-100 hover:border-brand-yellow transition-all duration-300 group"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileHover={{ x: 4 }}
                        >
                          <div className="relative shrink-0">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-yellow to-brand-orange flex items-center justify-center text-white font-bold shadow-md">
                              {user.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={user.avatar_url}
                                  alt={user.full_name || "User"}
                                  className="w-full h-full rounded-xl object-cover"
                                />
                              ) : (
                                <span className="text-lg">
                                  {user.full_name?.charAt(0).toUpperCase() || "?"}
                                </span>
                              )}
                            </div>
                            {user.hasOrdered && (
                              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                                <CheckCircle2 className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-brand-black truncate group-hover:text-brand-yellow-dark transition-colors">
                              {user.full_name || "Anonymous User"}
                            </p>
                            <p className="text-xs text-brand-gray-500 truncate">
                              {user.email || "No email provided"}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            {user.hasOrdered ? (
                              <div className="inline-flex items-center gap-1 bg-green-100 px-2.5 py-1 rounded-full">
                                <CheckCircle2 className="w-3 h-3 text-green-600" />
                                <span className="text-xs font-bold text-green-700">
                                  Active
                                </span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1 bg-orange-100 px-2.5 py-1 rounded-full">
                                <Clock className="w-3 h-3 text-orange-600" />
                                <span className="text-xs font-bold text-orange-700">
                                  Pending
                                </span>
                              </div>
                            )}
                            <p className="text-[10px] text-brand-gray-400 mt-1">
                              {new Date(user.created_at).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                              })}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {referredUsers.length > 5 && (
                    <button className="w-full mt-4 py-3 bg-brand-gray-100 hover:bg-brand-gray-200 rounded-xl font-semibold text-sm text-brand-black transition-colors">
                      View All {stats.totalReferred} Referrals
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Sidebar - Sharing Actions */}
          <motion.div
            className="lg:col-span-1 space-y-6 lg:sticky lg:top-20 lg:self-start"
            variants={fadeUp}
          >
            {/* Referral Code Card */}
            <div className="relative bg-gradient-to-br from-white to-brand-cream rounded-3xl p-6 lg:p-8 shadow-2xl border-2 border-brand-yellow/50 overflow-hidden">
              {/* Decorative Elements */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-yellow/10 rounded-full" />
              <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-brand-yellow via-brand-green to-purple-500" />

              <div className="relative z-10">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-2 bg-brand-yellow/10 px-4 py-2 rounded-full mb-3">
                    <Sparkles className="w-4 h-4 text-brand-yellow-dark" />
                    <span className="text-xs font-bold text-brand-yellow-dark uppercase tracking-wider">
                      Your Magic Code
                    </span>
                  </div>
                  <h3 className="font-heading text-lg font-bold text-brand-black">
                    Share & Earn
                  </h3>
                </div>

                {/* Code Display */}
                <motion.div
                  className="relative bg-white rounded-2xl p-6 border-2 border-dashed border-brand-yellow shadow-lg mb-6"
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 400 }}
                >
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-yellow px-3 py-1 rounded-full">
                    <span className="text-xs font-bold text-brand-black">CODE</span>
                  </div>
                  <p className="font-heading text-3xl lg:text-4xl font-bold text-center text-brand-black tracking-[0.3em] mt-2">
                    {referralCode || "---"}
                  </p>
                </motion.div>

                {/* Primary Actions */}
                <div className="space-y-3">
                  <motion.button
                    onClick={handleCopyCode}
                    disabled={!referralCode}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-sm transition-all shadow-lg",
                      copied
                        ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white"
                        : "bg-gradient-to-r from-brand-yellow to-brand-yellow-light text-brand-black hover:shadow-xl"
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <AnimatePresence mode="wait">
                      {copied ? (
                        <motion.div
                          key="copied"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="flex items-center gap-2"
                        >
                          <Check className="w-5 h-5" />
                          Copied!
                        </motion.div>
                      ) : (
                        <motion.div
                          key="copy"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="flex items-center gap-2"
                        >
                          <Copy className="w-5 h-5" />
                          Copy Code
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>

                  <motion.button
                    onClick={handleShare}
                    disabled={!referralCode}
                    className="w-full flex items-center justify-center gap-2 bg-white text-brand-black py-4 rounded-2xl font-bold text-sm border-2 border-brand-gray-200 hover:border-brand-yellow transition-all shadow-md hover:shadow-lg"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Share2 className="w-5 h-5" />
                    Share Link
                  </motion.button>
                </div>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t-2 border-dashed border-brand-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-3 py-1 text-brand-gray-500 font-bold rounded-full">
                      Quick Share
                    </span>
                  </div>
                </div>

                {/* Social Share Buttons */}
                <div className="space-y-3">
                  <motion.button
                    onClick={handleWhatsAppShare}
                    disabled={!referralCode}
                    className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-4 rounded-2xl font-bold text-sm hover:bg-[#1da851] transition-all shadow-lg hover:shadow-xl"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <MessageCircle className="w-5 h-5" />
                    WhatsApp
                  </motion.button>

                  <motion.button
                    onClick={handleCopyLink}
                    disabled={!referralCode}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-sm transition-all",
                      copiedLink
                        ? "bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg"
                        : "bg-brand-gray-100 text-brand-black border-2 border-brand-gray-200 hover:border-brand-gray-300 hover:shadow-md"
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <AnimatePresence mode="wait">
                      {copiedLink ? (
                        <motion.div
                          key="copied-link"
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0, rotate: 180 }}
                          className="flex items-center gap-2"
                        >
                          <Check className="w-5 h-5" />
                          Message Copied! ✨
                        </motion.div>
                      ) : (
                        <motion.div
                          key="copy-link"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="flex items-center gap-2"
                        >
                          <Copy className="w-5 h-5" />
                          Copy Full Message
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Quick Earnings Info */}
            <motion.div
              className="bg-gradient-to-br from-purple-100 via-pink-50 to-orange-50 rounded-3xl p-6 border border-purple-200"
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <h4 className="font-heading text-base font-bold text-brand-black">
                  Earnings Per Friend
                </h4>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl">
                  <span className="text-sm font-semibold text-brand-gray-700">
                    Loyalty Points:
                  </span>
                  <span className="font-heading text-lg font-bold text-purple-600">
                    {campaignConfig?.referrer_bonus_points ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl">
                  <span className="text-sm font-semibold text-brand-gray-700">
                    Wallet Bonus:
                  </span>
                  <span className="font-heading text-lg font-bold text-green-600">
                    {formatCurrency(campaignConfig?.referrer_wallet_bonus ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl">
                  <span className="text-sm font-bold text-white">
                    Success Rate:
                  </span>
                  <span className="font-heading text-lg font-bold text-white">
                    {conversionRate}%
                  </span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
