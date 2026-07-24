"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Star,
  Trophy,
  Target,
  Clock,
  CheckCircle2,
  ChevronLeft,
  Zap,
  Flame,
  Repeat,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, cn } from "@/lib/utils/helpers";
import { Spinner } from "@/components/ui/spinner";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  LoyaltyAccount,
  LoyaltyTier,
  Mission,
} from "@/lib/supabase/types";
import toast from "react-hot-toast";

interface LoyaltyAction {
  id: string;
  name: string;
  slug: string;
  description: string;
  points: number;
  event_type: string;
  max_per_day: number | null;
  is_active: boolean;
  created_at: string;
}

interface MissionProgress {
  id: string;
  user_id: string;
  mission_id: string;
  current_count: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PointsLog {
  id: string;
  user_id: string;
  action_id: string | null;
  mission_id: string | null;
  points: number;
  description: string;
  reference_id: string | null;
  created_at: string;
}

interface LoyaltyLedgerEntry {
  id: string;
  user_id: string;
  points: number;
  description: string;
  order_id: string | null;
  created_at: string;
}

const LOYALTY_TABS = [
  { label: "Earn", value: "earn" },
  { label: "Missions", value: "missions" },
  { label: "Rewards", value: "rewards" },
  { label: "History", value: "history" },
];

const TIER_DISPLAY: Record<string, { label: string; color: string; icon: string }> = {
  sprout_star: { label: "Sprout Star", color: "text-brand-yellow-dark", icon: "text-brand-yellow" },
  sprout_hero: { label: "Sprout Hero", color: "text-blue-600", icon: "text-blue-500" },
  pnut_legend: { label: "PNUT Legend", color: "text-purple-600", icon: "text-purple-500" },
};

function MissionTypeBadge({ type }: { type: Mission["type"] }) {
  switch (type) {
    case "one_time":
      return <Badge variant="info">One-Time</Badge>;
    case "recurring":
      return <Badge variant="warning">Recurring</Badge>;
    case "streak":
      return <Badge variant="danger">Streak</Badge>;
  }
}

function MissionTypeIcon({ type }: { type: Mission["type"] }) {
  switch (type) {
    case "one_time":
      return <Target className="w-5 h-5 text-blue-500" />;
    case "recurring":
      return <Repeat className="w-5 h-5 text-brand-yellow-dark" />;
    case "streak":
      return <Flame className="w-5 h-5 text-red-500" />;
  }
}

export default function LoyaltyPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("earn");
  const [userId, setUserId] = useState<string | null>(null);

  // Tier data
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [, setCurrentTier] = useState<LoyaltyTier | null>(null);
  const [, setAllTiers] = useState<LoyaltyTier[]>([]);
  const [nextTier, setNextTier] = useState<LoyaltyTier | null>(null);

  // Tab data
  const [actions, setActions] = useState<LoyaltyAction[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionProgress, setMissionProgress] = useState<
    Record<string, MissionProgress>
  >({});
  const [pointsLog, setPointsLog] = useState<PointsLog[]>([]);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [claimingSlug, setClaimingSlug] = useState<string | null>(null);
  const [claimableActions, setClaimableActions] = useState<Record<string, number>>({});
  const [todayClaimedCounts, setTodayClaimedCounts] = useState<Record<string, number>>({});
  const [firstOrderClaimed, setFirstOrderClaimed] = useState(false);

  // Order rating state
  const [unratedOrders, setUnratedOrders] = useState<{ id: string; order_number: string }[]>([]);
  const [ratedUnclaimedOrders, setRatedUnclaimedOrders] = useState<{ id: string; order_number: string; total: number }[]>([]);
  const [ratingOrderId, setRatingOrderId] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  // Points percentage settings
  const [pctWalletTopup, setPctWalletTopup] = useState(2);
  const [pctOrderPlaced, setPctOrderPlaced] = useState(5);

  // Unclaimed wallet topups with amounts
  const [unclaimedTopupsList, setUnclaimedTopupsList] = useState<{ id: string; amount: number }[]>([]);

  // Total lifetime order count for rewards section
  const [totalOrderCount, setTotalOrderCount] = useState(0);

  // Membership data from backend
  const [membershipEnabled, setMembershipEnabled] = useState(true);
  const [membershipTier, setMembershipTier] = useState("sprout_star");
  const [membershipCycleOrders, setMembershipCycleOrders] = useState(0);
  const [membershipTier1Threshold, setMembershipTier1Threshold] = useState(15);
  const [membershipTier2Threshold, setMembershipTier2Threshold] = useState(25);
  const [membershipBonusPct, setMembershipBonusPct] = useState(5);
  const [membershipCycleEnd, setMembershipCycleEnd] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // Fetch points percentage settings
      const { data: pctData } = await supabase
        .from("app_settings" as never)
        .select("key, value")
        .in("key" as never, ["points_pct_wallet_topup", "points_pct_order_placed"]);
      const pctRows = (pctData ?? []) as { key: string; value: string }[];
      for (const row of pctRows) {
        if (row.key === "points_pct_wallet_topup") setPctWalletTopup(parseFloat(row.value) || 2);
        if (row.key === "points_pct_order_placed") setPctOrderPlaced(parseFloat(row.value) || 5);
      }

      // Fetch all tiers
      const { data: tiersData } = await supabase
        .from("loyalty_tiers")
        .select("*")
        .order("sort_order", { ascending: true });
      const tiers = (tiersData ?? []) as LoyaltyTier[];
      setAllTiers(tiers);

      // Fetch loyalty account
      const { data: accountData } = await supabase
        .from("loyalty_accounts")
        .select("*")
        .eq("user_id", user.id)
        .single();
      const acct = accountData as LoyaltyAccount | null;
      setAccount(acct);

      if (acct && tiers.length > 0) {
        const ct = tiers.find((t) => t.id === acct.tier_id) ?? tiers[0];
        setCurrentTier(ct);
        // Find next tier
        const currentIdx = tiers.findIndex((t) => t.id === ct.id);
        if (currentIdx < tiers.length - 1) {
          setNextTier(tiers[currentIdx + 1]);
        } else {
          setNextTier(null);
        }
      }

      // Fetch loyalty actions
      const { data: actionsData } = await supabase
        .from("loyalty_actions")
        .select("*")
        .eq("is_active", true)
        .order("points", { ascending: false });
      setActions((actionsData ?? []) as LoyaltyAction[]);

      // Fetch active missions
      const now = new Date().toISOString();
      const { data: missionsData } = await supabase
        .from("missions")
        .select("*")
        .eq("is_active", true)
        .lte("starts_at", now)
        .or(`ends_at.is.null,ends_at.gte.${now}`);
      const ms = (missionsData ?? []) as Mission[];
      setMissions(ms);

      // Fetch mission progress
      if (ms.length > 0) {
        const missionIds = ms.map((m) => m.id);
        const { data: progressData } = await supabase
          .from("mission_progress")
          .select("*")
          .eq("user_id", user.id)
          .in("mission_id", missionIds);
        const progressMap: Record<string, MissionProgress> = {};
        for (const p of (progressData ?? []) as MissionProgress[]) {
          progressMap[p.mission_id] = p;
        }
        setMissionProgress(progressMap);
      }

      // Fetch points log
      const { data: logData } = await supabase
        .from("loyalty_points_log")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      const { data: refundLedgerData } = await supabase
        .from("loyalty_ledger" as never)
        .select("id, user_id, points, description, order_id, created_at")
        .eq("user_id" as never, user.id)
        .eq("source" as never, "order_refund")
        .order("created_at" as never, { ascending: false })
        .limit(50);
      const logs = (logData ?? []) as PointsLog[];
      const refundLogs = ((refundLedgerData ?? []) as LoyaltyLedgerEntry[]).map((entry) => ({
        id: entry.id,
        user_id: entry.user_id,
        action_id: null,
        mission_id: null,
        points: entry.points,
        description: entry.description,
        reference_id: entry.order_id,
        created_at: entry.created_at,
      }));
      const historyLogs = [...logs, ...refundLogs]
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .slice(0, 50);
      setPointsLog(historyLogs);

      // Count how many times each action has been claimed today
      const today = new Date().toISOString().slice(0, 10);
      const todayCounts: Record<string, number> = {};
      const allActions = (actionsData ?? []) as LoyaltyAction[];
      for (const log of logs) {
        if (log.created_at.slice(0, 10) === today && log.action_id) {
          const action = allActions.find((a) => a.id === log.action_id);
          if (action) todayCounts[action.slug] = (todayCounts[action.slug] ?? 0) + 1;
        }
      }
      setTodayClaimedCounts(todayCounts);

      // Count claimable instances for each action
      const claimable: Record<string, number> = {};

      // Fetch ALL order_placed logs (not just last 50) to properly track claimed orders
      const orderPlacedAction = allActions.find((a) => a.slug === "order_placed");
      const { data: allOrderLogs } = orderPlacedAction
        ? await supabase
            .from("loyalty_points_log")
            .select("reference_id")
            .eq("user_id", user.id)
            .eq("action_id", orderPlacedAction.id)
        : { data: null };
      const claimedOrderRefs = new Set(
        ((allOrderLogs ?? []) as { reference_id: string | null }[]).map((l) => l.reference_id)
      );

      // order_placed: only claimable if order is picked_up AND rated AND not yet claimed
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, order_number, total")
        .eq("user_id", user.id)
        .eq("status", "picked_up");
      const pickedUpOrders = (ordersData ?? []) as { id: string; order_number: string; total: number }[];
      setTotalOrderCount(pickedUpOrders.length);

      // Fetch membership status from backend
      const { data: membershipData } = await supabase.rpc("get_membership_status" as never, { p_user_id: user.id } as never);
      const mStatus = membershipData as { enabled: boolean; current_tier?: string; cycle_order_count?: number; tier1_threshold?: number; tier2_threshold?: number; bonus_pct?: number; cycle_end?: string } | null;
      if (mStatus) {
        setMembershipEnabled(mStatus.enabled);
        if (mStatus.enabled) {
          setMembershipTier(mStatus.current_tier ?? "sprout_star");
          setMembershipCycleOrders(mStatus.cycle_order_count ?? 0);
          setMembershipTier1Threshold(mStatus.tier1_threshold ?? 15);
          setMembershipTier2Threshold(mStatus.tier2_threshold ?? 25);
          setMembershipBonusPct(mStatus.bonus_pct ?? 5);
          setMembershipCycleEnd(mStatus.cycle_end ?? null);
        }
      }

      // Fetch user's ratings
      const { data: ratingsData } = await supabase
        .from("order_ratings" as never)
        .select("order_id")
        .eq("user_id" as never, user.id);
      const ratedOrderIds = new Set(
        ((ratingsData ?? []) as { order_id: string }[]).map((r) => r.order_id)
      );

      const unclaimedOrders = pickedUpOrders.filter((o) => !claimedOrderRefs.has(o.id));
      const ratedUnclaimed = unclaimedOrders.filter((o) => ratedOrderIds.has(o.id));
      const unrated = unclaimedOrders.filter((o) => !ratedOrderIds.has(o.id));

      setRatedUnclaimedOrders(ratedUnclaimed);
      setUnratedOrders(unrated);

      if (ratedUnclaimed.length > 0) claimable["order_placed"] = ratedUnclaimed.length;

      // first_order: lifetime one-time claim — check ALL logs (not just today)
      const firstOrderAction = allActions.find((a) => a.slug === "first_order");
      let claimedFirstOrder = false;
      if (firstOrderAction) {
        const { data: firstOrderLogs } = await supabase
          .from("loyalty_points_log")
          .select("id")
          .eq("user_id", user.id)
          .eq("action_id", firstOrderAction.id)
          .limit(1);
        claimedFirstOrder = ((firstOrderLogs ?? []) as { id: string }[]).length > 0;
      }
      setFirstOrderClaimed(claimedFirstOrder);
      if (!claimedFirstOrder && pickedUpOrders.length > 0) {
        claimable["first_order"] = 1;
      }

      const referralAction = allActions.find((a) => a.slug === "referral");
      if (referralAction) {
        const { data: referralClaimableData } = await supabase.rpc(
          "get_claimable_referral_rewards" as never
        );
        const referralClaimableCount = Number(referralClaimableData ?? 0);
        if (referralClaimableCount > 0) {
          claimable["referral"] = referralClaimableCount;
        }
      }

      // wallet_topup: check unclaimed topups
      const { data: userWallet } = await supabase
        .from("wallets")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (userWallet) {
        const walletTopupAction = allActions.find((a) => a.slug === "wallet_topup");
        const { data: allTopupLogs } = walletTopupAction
          ? await supabase
              .from("loyalty_points_log")
              .select("reference_id")
              .eq("user_id", user.id)
              .eq("action_id", walletTopupAction.id)
          : { data: null };
        const claimedTopupRefs = new Set(
          ((allTopupLogs ?? []) as { reference_id: string | null }[]).map((l) => l.reference_id)
        );

        const { data: userTopups } = await supabase
          .from("wallet_transactions")
          .select("id, amount")
          .eq("wallet_id", (userWallet as { id: string }).id)
          .eq("type", "topup");
        const allTopups = (userTopups ?? []) as { id: string; amount: number }[];
        const unclaimedTopups = allTopups.filter((t) => !claimedTopupRefs.has(t.id));
        setUnclaimedTopupsList(unclaimedTopups);
        if (unclaimedTopups.length > 0) claimable["wallet_topup"] = unclaimedTopups.length;
      } else {
        setUnclaimedTopupsList([]);
      }

      setClaimableActions(claimable);
    } catch (err) {
      console.error("Failed to fetch loyalty data:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("loyalty-realtime")
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "loyalty_accounts", filter: `user_id=eq.${userId}` } as never, () => { fetchData(); })
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "membership_cycles", filter: `user_id=eq.${userId}` } as never, () => { fetchData(); })
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` } as never, () => { fetchData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, supabase, fetchData]);

  const handleCheckIn = async () => {
    if (!userId) return;
    setCheckInLoading(true);
    try {
      const { error } = await supabase.rpc("award_loyalty_points" as never, {
        p_user_id: userId,
        p_action_slug: "daily_checkin",
        p_reference_id: "checkin_" + Date.now(),
      } as never);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Check-in successful! Points earned.");
      setLoading(true);
      await fetchData();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleClaim = async (actionSlug: string) => {
    if (!userId) return;
    setClaimingSlug(actionSlug);
    try {
      let refId = actionSlug + "_" + Date.now();

      // For order_placed, use actual order ID (backend computes points from order total)
      if (actionSlug === "order_placed" && ratedUnclaimedOrders.length > 0) {
        refId = ratedUnclaimedOrders[0].id;
      }

      // For wallet_topup, use actual topup ID (backend computes points from topup amount)
      if (actionSlug === "wallet_topup" && unclaimedTopupsList.length > 0) {
        refId = unclaimedTopupsList[0].id;
      }

      if (actionSlug === "referral") {
        const { data: rpcData, error } = await supabase.rpc("claim_referral_reward" as never);

        if (error) {
          toast.error(error.message);
          return;
        }

        const result = rpcData as { success: boolean; message?: string; points_awarded?: number } | null;
        if (result && !result.success) {
          toast.error(result.message || "Could not claim referral points");
          return;
        }

        toast.success(
          result?.points_awarded
            ? `+${result.points_awarded} referral points claimed!`
            : "Referral points claimed!"
        );
        setLoading(true);
        await fetchData();
        return;
      }

      const { data, error } = await supabase.rpc("award_loyalty_points" as never, {
        p_user_id: userId,
        p_action_slug: actionSlug,
        p_reference_id: refId,
      } as never);

      if (error) {
        toast.error(error.message);
        return;
      }

      const result = data as { success: boolean; error?: string; points_awarded?: number } | null;
      if (result && !result.success) {
        toast.error(result.error || "Could not claim points");
        return;
      }

      toast.success(
        result?.points_awarded
          ? `+${result.points_awarded} points claimed!`
          : "Points claimed successfully!"
      );
      setLoading(true);
      await fetchData();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setClaimingSlug(null);
    }
  };

  const handleRatingSubmit = async (orderId: string) => {
    if (!userId || ratingValue === 0) return;
    setRatingSubmitting(true);
    try {
      const { error } = await supabase
        .from("order_ratings" as never)
        .insert({
          order_id: orderId,
          user_id: userId,
          rating: ratingValue,
        } as never);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Thank you for your feedback!");
      setRatingOrderId(null);
      setRatingValue(0);
      setLoading(true);
      await fetchData();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setRatingSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  // Determine tier from order count (order-based system) - uses dynamic backend thresholds
  const ORDER_TIER_THRESHOLDS = [
    { slug: "sprout_star", minOrders: 0, nextAt: membershipTier1Threshold },
    { slug: "sprout_hero", minOrders: membershipTier1Threshold, nextAt: membershipTier2Threshold },
    { slug: "pnut_legend", minOrders: membershipTier2Threshold, nextAt: null },
  ];

  const currentOrderTier = (() => {
    for (let i = ORDER_TIER_THRESHOLDS.length - 1; i >= 0; i--) {
      if (membershipCycleOrders >= ORDER_TIER_THRESHOLDS[i].minOrders) return ORDER_TIER_THRESHOLDS[i];
    }
    return ORDER_TIER_THRESHOLDS[0];
  })();

  const nextOrderTier = ORDER_TIER_THRESHOLDS.find(
    (t) => t.minOrders > currentOrderTier.minOrders
  ) ?? null;

  const tierInfo = TIER_DISPLAY[currentOrderTier.slug] ?? {
    label: "Sprout Star",
    color: "text-brand-yellow-dark",
    icon: "text-brand-yellow",
  };

  const progressPercent = (() => {
    if (!nextOrderTier) return 100;
    const range = nextOrderTier.minOrders - currentOrderTier.minOrders;
    const value = membershipCycleOrders - currentOrderTier.minOrders;
    return Math.min(100, Math.round((value / range) * 100));
  })();

  return (
    <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">
      {/* Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-brand-gray-100 transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5 text-brand-gray-600" />
        </button>
        <h1 className="font-heading text-xl font-bold text-brand-black">
          Loyalty
        </h1>
      </div>

      {/* Tier Card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-brand-gray-100 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-brand-yellow/20 flex items-center justify-center">
            <Trophy className={cn("w-6 h-6", tierInfo.icon)} />
          </div>
          <div>
            <p className={cn("font-heading text-lg font-bold", tierInfo.color)}>
              {tierInfo.label}
            </p>
            <p className="text-xs text-brand-gray-500">
              {membershipCycleOrders} order{membershipCycleOrders !== 1 ? "s" : ""} this cycle
            </p>
          </div>
        </div>

        {/* Progress to Next Tier — Orders */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-brand-gray-500">
              Orders: {membershipCycleOrders}
            </p>
            {nextOrderTier ? (
              <p className="text-xs font-medium text-brand-gray-500">
                Next: {TIER_DISPLAY[nextOrderTier.slug]?.label ?? "Next Tier"} ({nextOrderTier.minOrders} orders)
              </p>
            ) : (
              <p className="text-xs font-medium text-purple-500">Max Tier!</p>
            )}
          </div>
          <div className="w-full h-2.5 bg-brand-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-yellow rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Loyalty Points Tracker */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-brand-gray-500">
              Points: {account?.current_points ?? 0}
            </p>
            <p className="text-xs font-medium text-brand-gray-500">
              Lifetime: {account?.lifetime_points ?? 0}
            </p>
          </div>
          <div className="w-full h-2.5 bg-brand-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full transition-all duration-500"
              style={{ width: `${nextTier ? Math.min(100, Math.round(((account?.lifetime_points ?? 0) / (nextTier.min_lifetime_points > 0 ? nextTier.min_lifetime_points : 1)) * 100)) : 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={LOYALTY_TABS}
        value={activeTab}
        onChange={setActiveTab}
        className="border-b border-brand-gray-100"
      />

      {/* Tab Content */}
      <div className="min-h-[200px]">
        {/* ===== Earn Tab ===== */}
        {activeTab === "earn" && (
          <div className="space-y-3">
            {actions.length === 0 ? (
              <EmptyState
                icon={<Zap className="w-12 h-12" />}
                title="No actions available"
                description="Check back later for ways to earn points."
              />
            ) : (
              actions.filter((a) => !(a.slug === "first_order" && firstOrderClaimed)).map((action) => {
                const isCheckIn =
                  action.slug === "daily_checkin" ||
                  action.event_type === "daily_checkin";
                const isOrderPlaced = action.slug === "order_placed";
                const isWalletTopup = action.slug === "wallet_topup";
                const isFirstOrder = action.slug === "first_order";
                const isPctBased = isOrderPlaced || isWalletTopup;
                const hasCheckedInToday = isCheckIn && (todayClaimedCounts["daily_checkin"] ?? 0) > 0;
                const claimCount = claimableActions[action.slug] ?? 0;
                const hasClaimable = !isCheckIn && !isOrderPlaced && !isFirstOrder && claimCount > 0;
                const hasDailyLimit = action.max_per_day !== null && action.max_per_day > 0;
                const todayCount = todayClaimedCounts[action.slug] ?? 0;
                const isMaxedToday = !isCheckIn && !isOrderPlaced && !isFirstOrder && hasDailyLimit && todayCount >= action.max_per_day!;

                return (
                  <div key={action.id} className="space-y-0">
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-brand-gray-100 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-brand-yellow/10 flex items-center justify-center shrink-0">
                        <Star className="w-5 h-5 text-brand-yellow-dark" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-brand-black">
                          {action.name}
                        </p>
                        <p className="text-xs text-brand-gray-500 mt-0.5">
                          {action.description}
                        </p>
                        {isOrderPlaced && (
                          <p className="text-[10px] text-brand-gray-400 mt-0.5">
                            Rate your order to claim points
                          </p>
                        )}
                        {!isOrderPlaced && !isWalletTopup && !isFirstOrder && action.max_per_day && (
                          <p className="text-[10px] text-brand-gray-400 mt-0.5">
                            Max {action.max_per_day}x per day
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {isPctBased ? (
                          <>
                            <p className="text-sm font-bold text-brand-yellow-dark">
                              {isOrderPlaced ? pctOrderPlaced : pctWalletTopup}%
                            </p>
                            <p className="text-[10px] text-brand-gray-400">of amount</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-bold text-brand-yellow-dark">
                              +{action.points}
                            </p>
                            <p className="text-[10px] text-brand-gray-400">pts</p>
                          </>
                        )}
                      </div>
                      {isCheckIn && (
                        hasCheckedInToday ? (
                          <span className="ml-1 px-3 py-1.5 bg-green-100 text-green-700 text-xs font-bold rounded-lg flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Checked In
                          </span>
                        ) : (
                          <button
                            onClick={handleCheckIn}
                            disabled={checkInLoading}
                            className="ml-1 px-3 py-1.5 bg-brand-yellow text-brand-black text-xs font-bold rounded-lg hover:bg-brand-yellow-dark transition-colors disabled:opacity-50"
                          >
                            {checkInLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              "Check In"
                            )}
                          </button>
                        )
                      )}
                      {isFirstOrder && firstOrderClaimed && (
                        <span className="ml-1 px-3 py-1.5 bg-green-100 text-green-700 text-xs font-bold rounded-lg flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Claimed
                        </span>
                      )}
                      {isFirstOrder && !firstOrderClaimed && claimCount > 0 && (
                        <button
                          onClick={() => handleClaim("first_order")}
                          disabled={claimingSlug === "first_order"}
                          className="ml-1 px-3 py-1.5 bg-brand-green text-white text-xs font-bold rounded-lg hover:bg-brand-green-dark transition-colors disabled:opacity-50"
                        >
                          {claimingSlug === "first_order" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            "Claim"
                          )}
                        </button>
                      )}
                      {isFirstOrder && !firstOrderClaimed && claimCount === 0 && (
                        <span className="ml-1 px-3 py-1.5 bg-brand-gray-100 text-brand-gray-400 text-xs font-bold rounded-lg">
                          Claim
                        </span>
                      )}
                      {isOrderPlaced && ratedUnclaimedOrders.length > 0 && (
                        <button
                          onClick={() => handleClaim("order_placed")}
                          disabled={claimingSlug === "order_placed"}
                          className="ml-1 px-3 py-1.5 bg-brand-green text-white text-xs font-bold rounded-lg hover:bg-brand-green-dark transition-colors disabled:opacity-50"
                        >
                          {claimingSlug === "order_placed" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            `Claim (${ratedUnclaimedOrders.length})`
                          )}
                        </button>
                      )}
                      {isOrderPlaced && ratedUnclaimedOrders.length === 0 && unratedOrders.length === 0 && (
                        <span className="ml-1 px-3 py-1.5 bg-brand-gray-100 text-brand-gray-400 text-xs font-bold rounded-lg">
                          Claim
                        </span>
                      )}
                      {!isCheckIn && !isOrderPlaced && !isFirstOrder && hasClaimable && !isMaxedToday && (
                        <button
                          onClick={() => handleClaim(action.slug)}
                          disabled={claimingSlug === action.slug}
                          className="ml-1 px-3 py-1.5 bg-brand-green text-white text-xs font-bold rounded-lg hover:bg-brand-green-dark transition-colors disabled:opacity-50"
                        >
                          {claimingSlug === action.slug ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            "Claim"
                          )}
                        </button>
                      )}
                      {!isCheckIn && !isOrderPlaced && !isFirstOrder && !hasClaimable && !isMaxedToday && (
                        <span className="ml-1 px-3 py-1.5 bg-brand-gray-100 text-brand-gray-400 text-xs font-bold rounded-lg">
                          Claim
                        </span>
                      )}
                      {!isCheckIn && !isOrderPlaced && !isFirstOrder && isMaxedToday && (
                        <span className="ml-1 px-3 py-1.5 bg-green-100 text-green-700 text-xs font-bold rounded-lg flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Claimed
                        </span>
                      )}
                    </div>

                    {/* Unrated orders - show rating UI */}
                    {isOrderPlaced && unratedOrders.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {unratedOrders.map((order) => (
                          <div
                            key={order.id}
                            className="bg-white rounded-xl p-3 shadow-sm border border-brand-gray-100 ml-6"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-brand-black">
                                Order #{order.order_number}
                              </p>
                              {ratingOrderId === order.id ? (
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-0.5">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <button
                                        key={star}
                                        onClick={() => setRatingValue(star)}
                                        onMouseEnter={() => setRatingHover(star)}
                                        onMouseLeave={() => setRatingHover(0)}
                                        className="p-0.5"
                                      >
                                        <Star
                                          className={cn(
                                            "w-5 h-5 transition-colors",
                                            (ratingHover || ratingValue) >= star
                                              ? "text-brand-yellow fill-brand-yellow"
                                              : "text-brand-gray-300"
                                          )}
                                        />
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => handleRatingSubmit(order.id)}
                                    disabled={ratingValue === 0 || ratingSubmitting}
                                    className="px-2.5 py-1 bg-brand-green text-white text-[10px] font-bold rounded-md hover:bg-brand-green-dark transition-colors disabled:opacity-50"
                                  >
                                    {ratingSubmitting ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      "Submit"
                                    )}
                                  </button>
                                  <button
                                    onClick={() => { setRatingOrderId(null); setRatingValue(0); }}
                                    className="text-brand-gray-400 text-[10px] font-medium hover:text-brand-gray-600"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setRatingOrderId(order.id); setRatingValue(0); setRatingHover(0); }}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-brand-yellow/10 text-brand-yellow-dark text-[10px] font-bold rounded-md hover:bg-brand-yellow/20 transition-colors"
                                >
                                  <Star className="w-3 h-3" />
                                  Rate to Claim
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ===== Missions Tab ===== */}
        {activeTab === "missions" && (
          <div className="space-y-3">
            {missions.length === 0 ? (
              <EmptyState
                icon={<Target className="w-12 h-12" />}
                title="No active missions"
                description="New missions will appear here. Check back soon!"
              />
            ) : (
              missions.map((mission) => {
                const progress = missionProgress[mission.id];
                const currentCount = progress?.current_count ?? 0;
                const isCompleted = progress?.is_completed ?? false;
                const percent = Math.min(
                  100,
                  Math.round((currentCount / mission.target_count) * 100)
                );
                return (
                  <div
                    key={mission.id}
                    className={cn(
                      "bg-white rounded-xl p-4 shadow-sm border",
                      isCompleted
                        ? "border-green-200 bg-green-50/50"
                        : "border-brand-gray-100"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-brand-gray-50 flex items-center justify-center shrink-0 mt-0.5">
                        <MissionTypeIcon type={mission.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-bold text-brand-black truncate">
                            {mission.name}
                          </p>
                          {isCompleted && (
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-brand-gray-500">
                          {mission.description}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <MissionTypeBadge type={mission.type} />
                          <span className="text-xs font-bold text-brand-yellow-dark">
                            +{mission.reward_points} pts
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-brand-gray-500">
                          {currentCount} / {mission.target_count}
                        </p>
                        <p className="text-xs font-semibold text-brand-gray-600">
                          {percent}%
                        </p>
                      </div>
                      <div className="w-full h-2 bg-brand-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            isCompleted ? "bg-green-500" : "bg-brand-yellow"
                          )}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    {mission.ends_at && (
                      <p className="text-[10px] text-brand-gray-400 mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Ends {formatDate(mission.ends_at)}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ===== Rewards Tab ===== */}
        {activeTab === "rewards" && (
          <div className="space-y-4">

            {/* Every 5th Order Discount */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-brand-gray-100 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-yellow to-orange-400 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">%</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-brand-black">Every 5th Order</p>
                  <p className="text-xs text-brand-gray-500">Flat 10% OFF</p>
                </div>
              </div>

              {/* Mini timeline */}
              <div className="flex items-center gap-0 overflow-x-auto pb-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                  const orderInCycle = totalOrderCount % 5;
                  const currentCyclePos = orderInCycle === 0 && totalOrderCount > 0 ? 5 : orderInCycle;
                  const isMilestone = n % 5 === 0;
                  const isCompleted = n <= currentCyclePos;
                  const isNext = n === currentCyclePos + 1;
                  return (
                    <div key={n} className="flex flex-col items-center shrink-0">
                      <div className="flex items-center">
                        {n > 1 && <div className={cn("w-2.5 h-0.5", isCompleted ? "bg-brand-yellow" : "bg-brand-gray-200")} />}
                        <div
                          className={cn(
                            "flex items-center justify-center rounded-full text-[9px] font-bold",
                            isMilestone && isCompleted
                              ? "w-7 h-7 bg-gradient-to-br from-brand-yellow to-orange-400 text-white shadow-sm"
                              : isMilestone
                              ? "w-7 h-7 bg-orange-100 text-orange-500 border border-orange-300"
                              : isCompleted
                              ? "w-5 h-5 bg-brand-yellow/30 text-brand-yellow-dark"
                              : isNext
                              ? "w-5 h-5 bg-brand-gray-100 text-brand-black ring-1 ring-brand-yellow"
                              : "w-5 h-5 bg-brand-gray-100 text-brand-gray-400"
                          )}
                        >
                          {n}
                        </div>
                        {n < 10 && <div className={cn("w-2.5 h-0.5", isCompleted && n < currentCyclePos ? "bg-brand-yellow" : "bg-brand-gray-200")} />}
                      </div>
                      {isMilestone && (
                        <span className="mt-1 text-[8px] font-bold text-green-600">10% OFF</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[11px] text-brand-gray-500">
                  Orders placed: <span className="font-bold text-brand-black">{totalOrderCount}</span>
                </p>
                <p className="text-[11px] text-brand-gray-500">
                  Next discount in: <span className="font-bold text-brand-yellow-dark">{5 - (totalOrderCount % 5 || 5)} order{(5 - (totalOrderCount % 5 || 5)) !== 1 ? "s" : ""}</span>
                </p>
              </div>
            </div>

            {/* Membership Journey */}
            {membershipEnabled && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-brand-gray-100 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-brand-black">Membership Journey</p>
                  <p className="text-xs text-brand-gray-500">Renews every 6 months</p>
                </div>
              </div>

              {/* Tier progress cards */}
              <div className="space-y-2.5">

                {/* Sprout Star */}
                <div className={cn(
                  "rounded-xl p-3.5 border space-y-2",
                  membershipTier === "sprout_star"
                    ? "bg-green-50 border-green-300 ring-1 ring-green-200"
                    : "bg-brand-gray-50 border-brand-gray-200 opacity-60"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">&#x1F331;</span>
                      <div>
                        <p className="text-xs font-bold text-green-800">Sprout Star</p>
                        <p className="text-[10px] text-green-600">Orders 0&ndash;{membershipTier1Threshold - 1}</p>
                      </div>
                    </div>
                    {membershipTier === "sprout_star" && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-md">Current</span>
                    )}
                    {membershipTier !== "sprout_star" && (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                  {membershipTier === "sprout_star" && (
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-green-600 mb-1">
                        <span>{membershipCycleOrders} / {membershipTier1Threshold} orders</span>
                        <span>Next: Sprout Hero</span>
                      </div>
                      <div className="w-full h-1.5 bg-green-200/50 rounded-full overflow-hidden">
                        <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${Math.min(100, (membershipCycleOrders / membershipTier1Threshold) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Sprout Hero */}
                <div className={cn(
                  "rounded-xl p-3.5 border space-y-2",
                  membershipTier === "sprout_hero"
                    ? "bg-blue-50 border-blue-300 ring-1 ring-blue-200"
                    : membershipTier === "pnut_legend"
                    ? "bg-brand-gray-50 border-brand-gray-200 opacity-60"
                    : "bg-brand-gray-50 border-brand-gray-200 opacity-40"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">&#x1F9B8;</span>
                      <div>
                        <p className="text-xs font-bold text-blue-800">Sprout Hero</p>
                        <p className="text-[10px] text-blue-600">Unlocks at {membershipTier1Threshold}th order</p>
                      </div>
                    </div>
                    {membershipTier === "sprout_hero" && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-md">Current</span>
                    )}
                    {membershipTier === "pnut_legend" && (
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                    )}
                    {membershipTier === "sprout_star" && (
                      <span className="px-2 py-0.5 bg-brand-gray-100 text-brand-gray-400 text-[10px] font-bold rounded-md">Locked</span>
                    )}
                  </div>
                  <p className="text-[11px] text-blue-700 font-medium">+{membershipBonusPct}% extra Loyalty Points on every order</p>
                  {membershipTier === "sprout_hero" && (
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-blue-600 mb-1">
                        <span>{membershipCycleOrders} / {membershipTier2Threshold} orders</span>
                        <span>Next: PNUT Legend</span>
                      </div>
                      <div className="w-full h-1.5 bg-blue-200/50 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${Math.min(100, ((membershipCycleOrders - membershipTier1Threshold) / (membershipTier2Threshold - membershipTier1Threshold)) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* PNUT Legend */}
                <div className={cn(
                  "rounded-xl p-3.5 border space-y-2",
                  membershipTier === "pnut_legend"
                    ? "bg-amber-50 border-amber-300 ring-1 ring-amber-200"
                    : "bg-brand-gray-50 border-brand-gray-200 opacity-40"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">&#x1F451;</span>
                      <div>
                        <p className="text-xs font-bold text-amber-800">PNUT Legend</p>
                        <p className="text-[10px] text-amber-600">Unlocks at {membershipTier2Threshold}th order</p>
                      </div>
                    </div>
                    {membershipTier === "pnut_legend" && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-md">Current</span>
                    )}
                    {membershipTier !== "pnut_legend" && (
                      <span className="px-2 py-0.5 bg-brand-gray-100 text-brand-gray-400 text-[10px] font-bold rounded-md">Locked</span>
                    )}
                  </div>
                  <p className="text-[11px] text-amber-700 font-medium">Exclusive PNUT Goodie + {membershipBonusPct}% Points continue</p>
                </div>

              </div>

              {/* Renewal info */}
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg border border-purple-100">
                <span className="text-sm">&#x1F504;</span>
                <p className="text-[10px] text-purple-700">
                  Membership renews every 6 months. Earned Hero status carries forward.
                  {membershipCycleEnd && (
                    <span className="ml-1 font-semibold">Cycle ends: {new Date(membershipCycleEnd).toLocaleDateString()}</span>
                  )}
                </p>
              </div>
            </div>
            )}

          </div>
        )}

        {/* ===== History Tab ===== */}
        {activeTab === "history" && (
          <div className="space-y-2">
            {pointsLog.length === 0 ? (
              <EmptyState
                icon={<Clock className="w-12 h-12" />}
                title="No points history"
                description="Your earned and spent points will appear here."
              />
            ) : (
              pointsLog.map((log) => {
                const isPositive = log.points > 0;
                return (
                  <div
                    key={log.id}
                    className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-sm border border-brand-gray-100"
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                        isPositive ? "bg-green-100" : "bg-red-100"
                      )}
                    >
                      <Star
                        className={cn(
                          "w-4 h-4",
                          isPositive ? "text-green-600" : "text-red-500"
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-black truncate">
                        {log.description}
                      </p>
                      <p className="text-xs text-brand-gray-400 mt-0.5">
                        {formatDate(log.created_at)}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "text-sm font-bold shrink-0",
                        isPositive ? "text-green-600" : "text-red-500"
                      )}
                    >
                      {isPositive ? "+" : ""}
                      {log.points} pts
                    </p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
