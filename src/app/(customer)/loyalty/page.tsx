"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Star,
  Trophy,
  Target,
  Gift,
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
  Json,
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
  const [currentTier, setCurrentTier] = useState<LoyaltyTier | null>(null);
  const [allTiers, setAllTiers] = useState<LoyaltyTier[]>([]);
  const [nextTier, setNextTier] = useState<LoyaltyTier | null>(null);

  // Tab data
  const [actions, setActions] = useState<LoyaltyAction[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionProgress, setMissionProgress] = useState<
    Record<string, MissionProgress>
  >({});
  const [pointsLog, setPointsLog] = useState<PointsLog[]>([]);
  const [checkInLoading, setCheckInLoading] = useState(false);

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
      setPointsLog((logData ?? []) as PointsLog[]);
    } catch (err) {
      console.error("Failed to fetch loyalty data:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCheckIn = async () => {
    if (!userId) return;
    setCheckInLoading(true);
    try {
      const { data, error } = await supabase.rpc("award_loyalty_points" as never, {
        p_user_id: userId,
        p_action_slug: "daily_checkin",
        p_reference_id: "checkin_" + Date.now(),
      } as never);
      const result = data as Json;

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const tierInfo = currentTier
    ? TIER_DISPLAY[currentTier.slug] ?? {
        label: currentTier.name,
        color: "text-brand-gray-700",
        icon: "text-brand-gray-400",
      }
    : { label: "Sprout Star", color: "text-brand-yellow-dark", icon: "text-brand-yellow" };

  const lifetimePoints = account?.lifetime_points ?? 0;
  const nextTierMin = nextTier?.min_lifetime_points ?? lifetimePoints;
  const currentTierMin = currentTier?.min_lifetime_points ?? 0;
  const progressRange = nextTierMin - currentTierMin;
  const progressValue = lifetimePoints - currentTierMin;
  const progressPercent =
    nextTier && progressRange > 0
      ? Math.min(100, Math.round((progressValue / progressRange) * 100))
      : 100;

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
              {account?.current_points ?? 0} points available
            </p>
          </div>
        </div>

        {/* Progress to Next Tier */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-brand-gray-500">
              Lifetime: {lifetimePoints.toLocaleString("en-IN")} pts
            </p>
            {nextTier ? (
              <p className="text-xs font-medium text-brand-gray-500">
                Next: {nextTier.name} ({nextTierMin.toLocaleString("en-IN")} pts)
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
              actions.map((action) => {
                const isCheckIn =
                  action.slug === "daily_checkin" ||
                  action.event_type === "daily_checkin";
                return (
                  <div
                    key={action.id}
                    className="bg-white rounded-xl p-4 shadow-sm border border-brand-gray-100 flex items-center gap-3"
                  >
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
                      {action.max_per_day && (
                        <p className="text-[10px] text-brand-gray-400 mt-0.5">
                          Max {action.max_per_day}x per day
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-brand-yellow-dark">
                        +{action.points}
                      </p>
                      <p className="text-[10px] text-brand-gray-400">pts</p>
                    </div>
                    {isCheckIn && (
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
          <EmptyState
            icon={<Gift className="w-12 h-12" />}
            title="Coming Soon"
            description="Exciting rewards are on the way! Stay tuned for coupons, badges, and exclusive perks."
          />
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
