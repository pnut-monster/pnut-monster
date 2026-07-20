"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campaign, Mission } from "@/lib/supabase/types";
import type { Json } from "@/lib/supabase/types";
import { formatDate, cn } from "@/lib/utils/helpers";
import { Tabs, Button, Input, Modal, Badge, Spinner } from "@/components/ui";
import {
  Plus,
  Pencil,
  Star,
  Trophy,
  Target,
  ToggleLeft,
  ToggleRight,
  Settings2,
  BarChart3,
  Search,
  TrendingUp,
  TrendingDown,
  Coins,
} from "lucide-react";

// --- Loyalty Action type (matches DB) ---
type LoyaltyAction = {
  id: string;
  name: string;
  slug: string;
  description: string;
  points: number;
  event_type: string;
  max_per_day: number | null;
  is_active: boolean;
  created_at: string;
};

// --- Section tabs ---
const SECTION_TABS = [
  { label: "Tiers", value: "tiers" },
  { label: "Actions", value: "actions" },
  { label: "Missions", value: "missions" },
  { label: "Referral", value: "referral" },
];

// ===================== TIERS =====================

// ===================== ACTIONS =====================

type ActionForm = {
  name: string;
  slug: string;
  description: string;
  points: string;
  event_type: string;
  max_per_day: string;
  is_active: boolean;
};

const EMPTY_ACTION_FORM: ActionForm = {
  name: "",
  slug: "",
  description: "",
  points: "0",
  event_type: "",
  max_per_day: "",
  is_active: true,
};

// ===================== MISSIONS =====================

type MissionForm = {
  name: string;
  description: string;
  type: Mission["type"];
  target_event: string;
  target_count: string;
  reward_points: string;
  reward_type: Mission["reward_type"];
  reward_value: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

const EMPTY_MISSION_FORM: MissionForm = {
  name: "",
  description: "",
  type: "one_time",
  target_event: "",
  target_count: "1",
  reward_points: "0",
  reward_type: "points",
  reward_value: "{}",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

type ReferralProgramForm = {
  name: string;
  referrer_bonus_points: string;
  referee_bonus_points: string;
  referrer_wallet_bonus: string;
  reward_trigger: "signup" | "first_order";
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

const toDateTimeLocal = (date: Date) => date.toISOString().slice(0, 16);

const EMPTY_REFERRAL_FORM: ReferralProgramForm = {
  name: "Refer & Earn",
  referrer_bonus_points: "100",
  referee_bonus_points: "50",
  referrer_wallet_bonus: "0",
  reward_trigger: "signup",
  starts_at: toDateTimeLocal(new Date()),
  ends_at: toDateTimeLocal(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
  is_active: true,
};

// --- Redemption settings type ---
type RedemptionSettings = {
  loyalty_point_value: string;
  loyalty_min_balance_to_redeem: string;
  loyalty_max_order_pct: string;
  loyalty_max_points_per_order: string;
  loyalty_allow_with_coupon: string;
  loyalty_allow_on_discounted: string;
  loyalty_cover_tax: string;
  loyalty_cover_packaging: string;
  loyalty_redemption_enabled: string;
};

const DEFAULT_REDEMPTION: RedemptionSettings = {
  loyalty_point_value: "0.25",
  loyalty_min_balance_to_redeem: "100",
  loyalty_max_order_pct: "50",
  loyalty_max_points_per_order: "500",
  loyalty_allow_with_coupon: "true",
  loyalty_allow_on_discounted: "true",
  loyalty_cover_tax: "false",
  loyalty_cover_packaging: "false",
  loyalty_redemption_enabled: "true",
};

type LoyaltyAnalytics = {
  total_points_issued: number;
  total_points_redeemed: number;
  outstanding_points: number;
  outstanding_liability: number;
  point_value: number;
  total_accounts: number;
  accounts_with_redemptions: number;
  redemption_rate: number;
};

type LedgerEntry = {
  id: string;
  user_id: string;
  type: "earn" | "redeem";
  points: number;
  monetary_value: number;
  balance_after: number;
  source: string;
  order_id: string | null;
  description: string;
  created_at: string;
};

type RatingEntry = {
  id: string;
  user_id: string;
  order_id: string;
  rating: number;
  created_at: string;
  orders?: { order_number: string | null } | null;
};

type RatingRow = {
  id: string;
  user_id: string;
  user_label: string;
  order_id: string;
  order_number: string | null;
  rating: number;
  created_at: string;
};

type ProfileSummary = {
  id: string;
  email: string | null;
  full_name: string | null;
};

export default function AdminLoyaltyPage() {
  const [section, setSection] = useState("tiers");
  const supabase = createClient();

  // --- Redemption settings ---
  const [redemption, setRedemption] = useState<RedemptionSettings>(DEFAULT_REDEMPTION);
  const [redemptionSaving, setRedemptionSaving] = useState(false);
  const [redemptionLoading, setRedemptionLoading] = useState(true);

  // --- Analytics ---
  const [analytics, setAnalytics] = useState<LoyaltyAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(true);

  // --- Actions ---
  const [actions, setActions] = useState<LoyaltyAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [actionModal, setActionModal] = useState(false);
  const [editingAction, setEditingAction] = useState<LoyaltyAction | null>(null);
  const [actionForm, setActionForm] = useState<ActionForm>(EMPTY_ACTION_FORM);
  const [actionSaving, setActionSaving] = useState(false);

  // --- Points Percentage Settings ---
  const [pctWalletTopup, setPctWalletTopup] = useState("2");
  const [pctOrderPlaced, setPctOrderPlaced] = useState("5");
  const [pctSaving, setPctSaving] = useState(false);

  // --- Missions ---
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(true);
  const [missionModal, setMissionModal] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [missionForm, setMissionForm] = useState<MissionForm>(EMPTY_MISSION_FORM);
  const [missionSaving, setMissionSaving] = useState(false);

  // --- Referral Program ---
  const [referralCampaign, setReferralCampaign] = useState<Campaign | null>(null);
  const [referralForm, setReferralForm] = useState<ReferralProgramForm>(EMPTY_REFERRAL_FORM);
  const [referralLoading, setReferralLoading] = useState(true);
  const [referralSaving, setReferralSaving] = useState(false);

  // --- Nth Order Discount ---
  const [nthOrderEnabled, setNthOrderEnabled] = useState(true);
  const [nthOrderStackWithLoyalty, setNthOrderStackWithLoyalty] = useState(true);
  const [nthOrderSaving, setNthOrderSaving] = useState(false);

  // --- Membership Journey ---
  const [membershipEnabled, setMembershipEnabled] = useState(true);
  const [membershipTier1, setMembershipTier1] = useState("15");
  const [membershipTier2, setMembershipTier2] = useState("25");
  const [membershipBonusPct, setMembershipBonusPct] = useState("5");
  const [membershipSaving, setMembershipSaving] = useState(false);

  // ---- Fetch ----
  const fetchActions = useCallback(async () => {
    setActionsLoading(true);
    const { data } = await supabase
      .from("loyalty_actions")
      .select("*")
      .order("created_at", { ascending: false });
    setActions((data as LoyaltyAction[] | null) ?? []);
    setActionsLoading(false);
  }, [supabase]);

  const fetchPointsPct = useCallback(async () => {
    const { data } = await supabase
      .from("app_settings" as never)
      .select("key, value")
      .in("key" as never, ["points_pct_wallet_topup", "points_pct_order_placed"]);
    const rows = (data ?? []) as { key: string; value: string }[];
    for (const row of rows) {
      if (row.key === "points_pct_wallet_topup") setPctWalletTopup(row.value);
      if (row.key === "points_pct_order_placed") setPctOrderPlaced(row.value);
    }
  }, [supabase]);

  const fetchMissions = useCallback(async () => {
    setMissionsLoading(true);
    const { data } = await supabase
      .from("missions")
      .select("*")
      .order("created_at", { ascending: false });
    setMissions((data as Mission[] | null) ?? []);
    setMissionsLoading(false);
  }, [supabase]);

  const fetchReferralProgram = useCallback(async () => {
    setReferralLoading(true);
    const { data } = await supabase
      .from("campaigns")
      .select("*")
      .eq("type", "referral")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const campaign = data as Campaign | null;
    setReferralCampaign(campaign);

    if (campaign) {
      const config = campaign.config as {
        referrer_bonus_points?: number;
        referrer_bonus?: number;
        referee_bonus_points?: number;
        referee_bonus?: number;
        referrer_wallet_bonus?: number;
        reward_trigger?: "signup" | "first_order";
      };
      setReferralForm({
        name: campaign.name,
        referrer_bonus_points: String(config.referrer_bonus_points ?? config.referrer_bonus ?? 0),
        referee_bonus_points: String(config.referee_bonus_points ?? config.referee_bonus ?? 0),
        referrer_wallet_bonus: String(config.referrer_wallet_bonus ?? 0),
        reward_trigger: config.reward_trigger === "first_order" ? "first_order" : "signup",
        starts_at: campaign.starts_at.slice(0, 16),
        ends_at: campaign.ends_at.slice(0, 16),
        is_active: campaign.is_active,
      });
    }

    setReferralLoading(false);
  }, [supabase]);

  const fetchRedemptionSettings = useCallback(async () => {
    setRedemptionLoading(true);
    const keys = Object.keys(DEFAULT_REDEMPTION);
    const { data } = await supabase
      .from("app_settings" as never)
      .select("key, value")
      .in("key" as never, keys);
    const rows = (data ?? []) as { key: string; value: string }[];
    const updated = { ...DEFAULT_REDEMPTION };
    for (const row of rows) {
      if (row.key in updated) {
        (updated as Record<string, string>)[row.key] = row.value;
      }
    }
    setRedemption(updated);
    setRedemptionLoading(false);
  }, [supabase]);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    const { data } = await supabase.rpc("get_loyalty_analytics" as never);
    if (data) setAnalytics(data as unknown as LoyaltyAnalytics);
    setAnalyticsLoading(false);
  }, [supabase]);

  const fetchLedger = useCallback(async () => {
    setLedgerLoading(true);
    const { data } = await supabase
      .from("loyalty_ledger" as never)
      .select("*")
      .order("created_at" as never, { ascending: false })
      .limit(100);
    setLedger((data ?? []) as LedgerEntry[]);
    setLedgerLoading(false);
  }, [supabase]);

  const fetchRatings = useCallback(async () => {
    setRatingsLoading(true);
    const { data: ratingData } = await supabase
      .from("order_ratings" as never)
      .select("id, user_id, order_id, rating, created_at, orders(order_number)")
      .order("created_at" as never, { ascending: false });
    const ratingEntries = (ratingData ?? []) as RatingEntry[];
    const userIds = Array.from(new Set(ratingEntries.map((rating) => rating.user_id)));
    const { data: profilesData } = userIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds)
      : { data: [] };
    const profiles = new Map(
      ((profilesData ?? []) as ProfileSummary[]).map((profile) => [profile.id, profile])
    );

    setRatings(ratingEntries.map((rating) => {
      const profile = profiles.get(rating.user_id);
      return {
        id: rating.id,
        user_id: rating.user_id,
        user_label: profile?.full_name || profile?.email || rating.user_id,
        order_id: rating.order_id,
        order_number: rating.orders?.order_number ?? null,
        rating: rating.rating,
        created_at: rating.created_at,
      };
    }));
    setRatingsLoading(false);
  }, [supabase]);

  const fetchNthOrderSettings = useCallback(async () => {
    const { data } = await supabase
      .from("app_settings" as never)
      .select("key, value")
      .in("key" as never, ["nth_order_discount_enabled", "nth_order_stack_with_loyalty"]);
    const rows = (data ?? []) as { key: string; value: string }[];
    for (const row of rows) {
      if (row.key === "nth_order_discount_enabled") setNthOrderEnabled(row.value === "true");
      if (row.key === "nth_order_stack_with_loyalty") setNthOrderStackWithLoyalty(row.value === "true");
    }
  }, [supabase]);

  const fetchMembershipSettings = useCallback(async () => {
    const { data } = await supabase
      .from("app_settings" as never)
      .select("key, value")
      .in("key" as never, ["membership_enabled", "membership_tier1_threshold", "membership_tier2_threshold", "membership_bonus_pct"]);
    const rows = (data ?? []) as { key: string; value: string }[];
    for (const row of rows) {
      if (row.key === "membership_enabled") setMembershipEnabled(row.value === "true");
      if (row.key === "membership_tier1_threshold") setMembershipTier1(row.value);
      if (row.key === "membership_tier2_threshold") setMembershipTier2(row.value);
      if (row.key === "membership_bonus_pct") setMembershipBonusPct(row.value);
    }
  }, [supabase]);

  useEffect(() => {
    fetchActions();
    fetchMissions();
    fetchPointsPct();
    fetchReferralProgram();
    fetchRedemptionSettings();
    fetchAnalytics();
    fetchLedger();
    fetchRatings();
    fetchNthOrderSettings();
    fetchMembershipSettings();
  }, [fetchActions, fetchMissions, fetchPointsPct, fetchReferralProgram, fetchRedemptionSettings, fetchAnalytics, fetchLedger, fetchRatings, fetchNthOrderSettings, fetchMembershipSettings]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-loyalty-activity")
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "loyalty_ledger" } as never, () => {
        fetchLedger();
        fetchAnalytics();
      })
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "order_ratings" } as never, () => {
        fetchRatings();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchLedger, fetchAnalytics, fetchRatings]);

  // ===================== ACTION HANDLERS =====================
  const openActionAdd = () => {
    setEditingAction(null);
    setActionForm(EMPTY_ACTION_FORM);
    setActionModal(true);
  };

  const openActionEdit = (action: LoyaltyAction) => {
    setEditingAction(action);
    setActionForm({
      name: action.name,
      slug: action.slug,
      description: action.description,
      points: String(action.points),
      event_type: action.event_type,
      max_per_day: action.max_per_day != null ? String(action.max_per_day) : "",
      is_active: action.is_active,
    });
    setActionModal(true);
  };

  const saveAction = async () => {
    if (!actionForm.name) return;
    setActionSaving(true);
    const payload = {
      name: actionForm.name,
      slug: actionForm.slug || actionForm.name.toLowerCase().replace(/\s+/g, "_"),
      description: actionForm.description,
      points: parseInt(actionForm.points) || 0,
      event_type: actionForm.event_type,
      max_per_day: actionForm.max_per_day ? parseInt(actionForm.max_per_day) : null,
      is_active: actionForm.is_active,
    };

    if (editingAction) {
      await supabase.from("loyalty_actions").update(payload as never).eq("id", editingAction.id);
    } else {
      await supabase.from("loyalty_actions").insert(payload as never);
    }
    setActionSaving(false);
    setActionModal(false);
    fetchActions();
  };

  const toggleActionActive = async (action: LoyaltyAction) => {
    await supabase.from("loyalty_actions").update({ is_active: !action.is_active } as never).eq("id", action.id);
    setActions((prev) =>
      prev.map((a) => (a.id === action.id ? { ...a, is_active: !a.is_active } : a))
    );
  };

  const savePointsPct = async () => {
    setPctSaving(true);
    await Promise.all([
      supabase
        .from("app_settings" as never)
        .update({ value: pctWalletTopup } as never)
        .eq("key" as never, "points_pct_wallet_topup"),
      supabase
        .from("app_settings" as never)
        .update({ value: pctOrderPlaced } as never)
        .eq("key" as never, "points_pct_order_placed"),
    ]);
    setPctSaving(false);
  };

  // ===================== REDEMPTION HANDLERS =====================
  const saveRedemption = async () => {
    setRedemptionSaving(true);
    const entries = Object.entries(redemption);
    await Promise.all(
      entries.map(([key, value]) =>
        supabase
          .from("app_settings" as never)
          .update({ value } as never)
          .eq("key" as never, key)
      )
    );
    setRedemptionSaving(false);
    fetchAnalytics();
  };

  const updateRedemption = (key: keyof RedemptionSettings, value: string) => {
    setRedemption((prev) => ({ ...prev, [key]: value }));
  };

  const toggleRedemption = (key: keyof RedemptionSettings) => {
    setRedemption((prev) => ({
      ...prev,
      [key]: prev[key] === "true" ? "false" : "true",
    }));
  };

  const filteredLedger = ledger.filter((entry) => {
    if (!ledgerSearch.trim()) return true;
    const q = ledgerSearch.toLowerCase();
    return (
      entry.description.toLowerCase().includes(q) ||
      entry.source.toLowerCase().includes(q) ||
      entry.user_id.toLowerCase().includes(q) ||
      (entry.order_id ?? "").toLowerCase().includes(q)
    );
  });
  const overallRating = ratings.length > 0
    ? ratings.reduce((sum, rating) => sum + rating.rating, 0) / ratings.length
    : 0;

  // ===================== MISSION HANDLERS =====================
  const openMissionAdd = () => {
    setEditingMission(null);
    setMissionForm(EMPTY_MISSION_FORM);
    setMissionModal(true);
  };

  const openMissionEdit = (mission: Mission) => {
    setEditingMission(mission);
    setMissionForm({
      name: mission.name,
      description: mission.description,
      type: mission.type,
      target_event: mission.target_event,
      target_count: String(mission.target_count),
      reward_points: String(mission.reward_points),
      reward_type: mission.reward_type,
      reward_value: JSON.stringify(mission.reward_value, null, 2),
      starts_at: mission.starts_at.slice(0, 16),
      ends_at: mission.ends_at?.slice(0, 16) ?? "",
      is_active: mission.is_active,
    });
    setMissionModal(true);
  };

  const saveMission = async () => {
    if (!missionForm.name) return;
    setMissionSaving(true);
    let rewardValueParsed: Json;
    try {
      rewardValueParsed = JSON.parse(missionForm.reward_value);
    } catch {
      rewardValueParsed = {};
    }
    const payload = {
      name: missionForm.name,
      description: missionForm.description,
      type: missionForm.type,
      target_event: missionForm.target_event,
      target_count: parseInt(missionForm.target_count) || 1,
      reward_points: parseInt(missionForm.reward_points) || 0,
      reward_type: missionForm.reward_type,
      reward_value: rewardValueParsed,
      starts_at: new Date(missionForm.starts_at).toISOString(),
      ends_at: missionForm.ends_at ? new Date(missionForm.ends_at).toISOString() : null,
      is_active: missionForm.is_active,
    };

    if (editingMission) {
      await supabase.from("missions").update(payload as never).eq("id", editingMission.id);
    } else {
      await supabase.from("missions").insert(payload as never);
    }
    setMissionSaving(false);
    setMissionModal(false);
    fetchMissions();
  };

  const toggleMissionActive = async (mission: Mission) => {
    await supabase.from("missions").update({ is_active: !mission.is_active } as never).eq("id", mission.id);
    setMissions((prev) =>
      prev.map((m) => (m.id === mission.id ? { ...m, is_active: !m.is_active } : m))
    );
  };

  const saveReferralProgram = async () => {
    if (!referralForm.name || !referralForm.starts_at || !referralForm.ends_at) return;
    setReferralSaving(true);

    const payload = {
      name: referralForm.name,
      type: "referral" as const,
      config: {
        referrer_bonus_points: parseInt(referralForm.referrer_bonus_points) || 0,
        referee_bonus_points: parseInt(referralForm.referee_bonus_points) || 0,
        referrer_wallet_bonus: parseFloat(referralForm.referrer_wallet_bonus) || 0,
        reward_trigger: referralForm.reward_trigger,
      },
      starts_at: new Date(referralForm.starts_at).toISOString(),
      ends_at: new Date(referralForm.ends_at).toISOString(),
      is_active: referralForm.is_active,
    };

    if (referralCampaign) {
      await supabase.from("campaigns").update(payload as never).eq("id", referralCampaign.id);
    } else {
      await supabase.from("campaigns").insert(payload as never);
    }

    setReferralSaving(false);
    fetchReferralProgram();
  };

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 px-2 pt-2">
        <Tabs tabs={SECTION_TABS} value={section} onChange={setSection} />
      </div>

      {/* ==================== TIERS ==================== */}
      {section === "tiers" && (
        <div className="space-y-6">

          {/* ─── Reward System 1: Every 5th Order Discount ─── */}
          <div className="bg-white rounded-2xl shadow-sm border border-brand-gray-100 p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-yellow to-orange-400 flex items-center justify-center shadow-sm">
                <span className="text-lg font-bold text-white">%</span>
              </div>
              <div>
                <h3 className="font-bold text-brand-black text-base">Reward System 1 &mdash; Every 5th Order Discount</h3>
                <p className="text-xs text-brand-gray-500">Flat 10% OFF on every 5th order, forever</p>
              </div>
            </div>

            <div className="bg-gradient-to-r from-brand-yellow/5 to-orange-50 rounded-xl p-4 border border-brand-yellow/20">
              <p className="text-sm text-brand-gray-700 leading-relaxed">
                Every customer automatically receives a <span className="font-bold text-brand-black">flat 10% discount</span> on every 5th order.
                This reward <span className="font-semibold">never expires</span>, <span className="font-semibold">never resets</span>, and continues throughout the customer&apos;s lifetime.
              </p>
            </div>

            {/* Order Timeline */}
            <div className="relative">
              <p className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide mb-3">Order Timeline</p>
              <div className="flex items-center gap-0 overflow-x-auto pb-2">
                {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => {
                  const isMilestone = n % 5 === 0;
                  return (
                    <div key={n} className="flex flex-col items-center shrink-0">
                      <div className="flex items-center">
                        {n > 1 && <div className={cn("w-3 h-0.5", isMilestone || (n - 1) % 5 === 0 ? "bg-brand-yellow" : "bg-brand-gray-200")} />}
                        <div
                          className={cn(
                            "flex items-center justify-center rounded-full text-[10px] font-bold transition-all",
                            isMilestone
                              ? "w-9 h-9 bg-gradient-to-br from-brand-yellow to-orange-400 text-white shadow-md shadow-brand-yellow/30 ring-2 ring-brand-yellow/20"
                              : "w-6 h-6 bg-brand-gray-100 text-brand-gray-500"
                          )}
                        >
                          {n}
                        </div>
                        {n < 30 && <div className={cn("w-3 h-0.5", isMilestone ? "bg-brand-yellow" : "bg-brand-gray-200")} />}
                      </div>
                      {isMilestone && (
                        <span className="mt-1.5 px-1.5 py-0.5 bg-green-100 text-green-700 text-[9px] font-bold rounded-md whitespace-nowrap">
                          10% OFF
                        </span>
                      )}
                    </div>
                  );
                })}
                <span className="ml-2 text-xs text-brand-gray-400 font-medium shrink-0">...and so on</span>
              </div>
            </div>

            {/* Admin Controls */}
            <div className="border-t border-brand-gray-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide">Controls</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-brand-black">Enable Discount</p>
                  <p className="text-xs text-brand-gray-500">Turn the 5th-order discount on/off</p>
                </div>
                <button
                  type="button"
                  disabled={nthOrderSaving}
                  onClick={async () => {
                    setNthOrderSaving(true);
                    const newVal = !nthOrderEnabled;
                    await supabase.from("app_settings" as never).update({ value: String(newVal) } as never).eq("key" as never, "nth_order_discount_enabled" as never);
                    setNthOrderEnabled(newVal);
                    setNthOrderSaving(false);
                  }}
                >
                  {nthOrderEnabled ? <ToggleRight className="w-8 h-8 text-brand-green" /> : <ToggleLeft className="w-8 h-8 text-brand-gray-400" />}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-brand-black">Stack with Loyalty Points</p>
                  <p className="text-xs text-brand-gray-500">Allow both 5th-order discount and point redemption on same order</p>
                </div>
                <button
                  type="button"
                  disabled={nthOrderSaving}
                  onClick={async () => {
                    setNthOrderSaving(true);
                    const newVal = !nthOrderStackWithLoyalty;
                    await supabase.from("app_settings" as never).update({ value: String(newVal) } as never).eq("key" as never, "nth_order_stack_with_loyalty" as never);
                    setNthOrderStackWithLoyalty(newVal);
                    setNthOrderSaving(false);
                  }}
                >
                  {nthOrderStackWithLoyalty ? <ToggleRight className="w-8 h-8 text-brand-green" /> : <ToggleLeft className="w-8 h-8 text-brand-gray-400" />}
                </button>
              </div>
            </div>
          </div>

          {/* ─── Reward System 2: Membership Journey ─── */}
          <div className="bg-white rounded-2xl shadow-sm border border-brand-gray-100 p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-sm">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-brand-black text-base">Reward System 2 &mdash; Membership Journey</h3>
                <p className="text-xs text-brand-gray-500">Renews every 6 months &bull; Based on order count</p>
              </div>
            </div>

            {/* Tier Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Tier 1: Sprout Star */}
              <div className="relative bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border border-green-200 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">&#x1F331;</span>
                  <div>
                    <h4 className="font-bold text-green-800 text-sm">Sprout Star</h4>
                    <p className="text-[10px] text-green-600 font-medium">Orders 0&ndash;14</p>
                  </div>
                </div>
                <p className="text-xs text-green-700 leading-relaxed">
                  Default tier for all new customers. No extra loyalty points at this stage, but all other loyalty features (Place an Order, Daily Check-in, etc.) continue working alongside.
                </p>
                {/* Progress visual */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-green-600 font-medium">
                    <span>Progress to Sprout Hero</span>
                    <span>0 / 15 orders</span>
                  </div>
                  <div className="w-full h-2 bg-green-200/50 rounded-full overflow-hidden">
                    <div className="h-full w-[30%] bg-gradient-to-r from-green-400 to-emerald-400 rounded-full" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 font-semibold rounded-md">Starting Tier</span>
                </div>
              </div>

              {/* Tier 2: Sprout Hero */}
              <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200 space-y-3 ring-1 ring-blue-300/50 shadow-sm shadow-blue-100">
                <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-md shadow-sm">
                  +5% POINTS
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">&#x1F9B8;</span>
                  <div>
                    <h4 className="font-bold text-blue-800 text-sm">Sprout Hero</h4>
                    <p className="text-[10px] text-blue-600 font-medium">Unlocked at 15th order</p>
                  </div>
                </div>
                <p className="text-xs text-blue-700 leading-relaxed">
                  Earns <span className="font-bold">5% extra Loyalty Points</span> on every order value, on top of all existing points from feedback, daily check-in, etc.
                </p>
                <div className="bg-blue-100/50 rounded-lg p-2.5 border border-blue-200/50">
                  <p className="text-[11px] text-blue-800 font-medium">
                    Example: &#8377;500 order &rarr; <span className="font-bold">25 extra loyalty points</span>
                  </p>
                  <p className="text-[10px] text-blue-600 mt-0.5">
                    Continues on every order (16th, 17th, 18th...and beyond)
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 font-semibold rounded-md flex items-center gap-1">
                    <Star className="w-3 h-3" /> Hero Unlocked
                  </span>
                </div>
              </div>

              {/* Tier 3: PNUT Legend */}
              <div className="relative bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl p-5 border border-amber-300 space-y-3 ring-1 ring-amber-300/50 shadow-sm shadow-amber-100">
                <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-[9px] font-bold rounded-md shadow-sm">
                  GOODIE
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">&#x1F451;</span>
                  <div>
                    <h4 className="font-bold text-amber-800 text-sm">PNUT Legend</h4>
                    <p className="text-[10px] text-amber-600 font-medium">Unlocked at 25th order</p>
                  </div>
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Receives an <span className="font-bold">exclusive PNUT Goodie</span>. The 5% extra Loyalty Points from Sprout Hero continues without interruption. All other point sources remain active.
                </p>
                <div className="bg-amber-100/50 rounded-lg p-2.5 border border-amber-200/50">
                  <p className="text-[11px] text-amber-800 font-medium flex items-center gap-1.5">
                    <span className="text-base">&#x1F381;</span> Exclusive PNUT Goodie + 5% Points continue
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 font-semibold rounded-md flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Legend Unlocked
                  </span>
                </div>
              </div>
            </div>

            {/* Membership Renewal */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-5 border border-purple-200 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <span className="text-base">&#x1F504;</span>
                </div>
                <div>
                  <h4 className="font-bold text-purple-800 text-sm">Membership Renewal &mdash; Every 6 Months</h4>
                  <p className="text-[10px] text-purple-600 font-medium">Cycle resets, but earned tiers provide a head start</p>
                </div>
              </div>

              <div className="text-xs text-purple-700 space-y-2 leading-relaxed">
                <p>
                  After every 6-month cycle, the membership journey resets. The customer progresses again by completing orders.
                </p>
                <div className="bg-white/60 rounded-lg p-3 border border-purple-200/50 space-y-1.5">
                  <p className="font-semibold text-purple-800">Renewal Rules:</p>
                  <ul className="space-y-1 ml-3 list-disc text-purple-700">
                    <li>If the customer was <span className="font-bold">Sprout Star</span> when the cycle ended &rarr; restarts as <span className="font-semibold">Sprout Star</span></li>
                    <li>If the customer reached <span className="font-bold">Sprout Hero</span> (completed 15+ orders in the cycle) &rarr; restarts as <span className="font-semibold">Sprout Hero</span> in the next cycle</li>
                    <li>If the customer reached <span className="font-bold">PNUT Legend</span> &rarr; restarts as <span className="font-semibold">Sprout Hero</span> (must earn Legend again)</li>
                  </ul>
                </div>
              </div>

              {/* Circular timeline visual */}
              <div className="flex items-center justify-center gap-3 py-2">
                <div className="flex items-center gap-0">
                  {/* Cycle visualization */}
                  <div className="flex items-center gap-1">
                    <div className="w-10 h-10 rounded-full bg-green-100 border-2 border-green-400 flex items-center justify-center text-sm">&#x1F331;</div>
                    <div className="w-6 h-0.5 bg-gradient-to-r from-green-400 to-blue-400" />
                    <div className="w-10 h-10 rounded-full bg-blue-100 border-2 border-blue-400 flex items-center justify-center text-sm">&#x1F9B8;</div>
                    <div className="w-6 h-0.5 bg-gradient-to-r from-blue-400 to-amber-400" />
                    <div className="w-10 h-10 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center text-sm">&#x1F451;</div>
                    <div className="w-6 h-0.5 bg-purple-300" />
                    <div className="w-10 h-10 rounded-full bg-purple-100 border-2 border-purple-400 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-purple-600">6mo</span>
                    </div>
                    <div className="w-6 h-0.5 bg-purple-300" />
                    <div className="flex items-center gap-0.5">
                      <span className="text-lg">&#x1F504;</span>
                    </div>
                    <div className="w-6 h-0.5 bg-gradient-to-r from-purple-300 to-blue-400" />
                    <div className="w-10 h-10 rounded-full bg-blue-100 border-2 border-blue-400 flex items-center justify-center text-sm ring-2 ring-blue-200">&#x1F9B8;</div>
                  </div>
                </div>
              </div>
              <p className="text-center text-[10px] text-purple-500 font-medium">
                Sprout Hero status is carried forward &mdash; customers don&apos;t restart from scratch if they earned Hero in the previous cycle
              </p>
            </div>

            {/* Admin Controls */}
            <div className="border-t border-brand-gray-100 pt-5 space-y-4">
              <p className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide">Controls</p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-brand-black">Enable Membership System</p>
                  <p className="text-xs text-brand-gray-500">Turn the tier journey on/off globally</p>
                </div>
                <button
                  type="button"
                  disabled={membershipSaving}
                  onClick={async () => {
                    setMembershipSaving(true);
                    const newVal = !membershipEnabled;
                    await supabase.from("app_settings" as never).update({ value: String(newVal) } as never).eq("key" as never, "membership_enabled" as never);
                    setMembershipEnabled(newVal);
                    setMembershipSaving(false);
                  }}
                >
                  {membershipEnabled ? <ToggleRight className="w-8 h-8 text-brand-green" /> : <ToggleLeft className="w-8 h-8 text-brand-gray-400" />}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-brand-gray-50 rounded-xl p-4 space-y-2">
                  <label className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide">Sprout Hero Threshold</label>
                  <p className="text-[10px] text-brand-gray-400">Orders needed to reach Sprout Hero</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={membershipTier1}
                      onChange={(e) => setMembershipTier1(e.target.value)}
                      className="w-20 rounded-lg border border-brand-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-black text-center focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
                    />
                    <span className="text-xs text-brand-gray-400">orders</span>
                  </div>
                </div>

                <div className="bg-brand-gray-50 rounded-xl p-4 space-y-2">
                  <label className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide">PNUT Legend Threshold</label>
                  <p className="text-[10px] text-brand-gray-400">Orders needed to reach PNUT Legend</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={membershipTier2}
                      onChange={(e) => setMembershipTier2(e.target.value)}
                      className="w-20 rounded-lg border border-brand-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-black text-center focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
                    />
                    <span className="text-xs text-brand-gray-400">orders</span>
                  </div>
                </div>

                <div className="bg-brand-gray-50 rounded-xl p-4 space-y-2">
                  <label className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide">Bonus Points %</label>
                  <p className="text-[10px] text-brand-gray-400">Extra points on each order for Hero+</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={membershipBonusPct}
                      onChange={(e) => setMembershipBonusPct(e.target.value)}
                      className="w-20 rounded-lg border border-brand-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-black text-center focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
                    />
                    <span className="text-sm font-bold text-brand-gray-600">%</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  loading={membershipSaving}
                  onClick={async () => {
                    setMembershipSaving(true);
                    await Promise.all([
                      supabase.from("app_settings" as never).update({ value: membershipTier1 } as never).eq("key" as never, "membership_tier1_threshold" as never),
                      supabase.from("app_settings" as never).update({ value: membershipTier2 } as never).eq("key" as never, "membership_tier2_threshold" as never),
                      supabase.from("app_settings" as never).update({ value: membershipBonusPct } as never).eq("key" as never, "membership_bonus_pct" as never),
                    ]);
                    setMembershipSaving(false);
                  }}
                >
                  Save Settings
                </Button>
              </div>
            </div>
          </div>

          {/* ─── Point Redemption Controls ─── */}
          <div className="bg-white rounded-2xl shadow-sm border border-brand-gray-100 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
                  <Settings2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-brand-black text-base">Point Redemption Controls</h3>
                  <p className="text-xs text-brand-gray-500">Configure how customers can spend loyalty points at checkout</p>
                </div>
              </div>
              <Button size="sm" loading={redemptionSaving} onClick={saveRedemption}>
                Save All
              </Button>
            </div>

            {redemptionLoading ? (
              <div className="flex items-center justify-center py-10"><Spinner size="lg" /></div>
            ) : (
              <div className="space-y-5">
                {/* Master toggle */}
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                  <div>
                    <p className="text-sm font-bold text-emerald-800">Redemption System</p>
                    <p className="text-xs text-emerald-600">Enable or disable point redemption globally</p>
                  </div>
                  <button onClick={() => toggleRedemption("loyalty_redemption_enabled")}>
                    {redemption.loyalty_redemption_enabled === "true" ? (
                      <ToggleRight className="w-8 h-8 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-brand-gray-300" />
                    )}
                  </button>
                </div>

                {/* Point value */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-brand-gray-50 rounded-xl p-4 space-y-2">
                    <label className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide">Point Value (₹)</label>
                    <p className="text-[10px] text-brand-gray-400">Monetary worth of 1 point</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-brand-gray-600">₹</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={redemption.loyalty_point_value}
                        onChange={(e) => updateRedemption("loyalty_point_value", e.target.value)}
                        className="w-24 rounded-lg border border-brand-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-black text-center focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
                      />
                      <span className="text-xs text-brand-gray-400">per point</span>
                    </div>
                  </div>

                  <div className="bg-brand-gray-50 rounded-xl p-4 space-y-2">
                    <label className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide">Min Balance to Redeem</label>
                    <p className="text-[10px] text-brand-gray-400">Points required before redemption unlocks</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={redemption.loyalty_min_balance_to_redeem}
                        onChange={(e) => updateRedemption("loyalty_min_balance_to_redeem", e.target.value)}
                        className="w-24 rounded-lg border border-brand-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-black text-center focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
                      />
                      <span className="text-xs text-brand-gray-400">points</span>
                    </div>
                  </div>

                  <div className="bg-brand-gray-50 rounded-xl p-4 space-y-2">
                    <label className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide">Max Points Per Order</label>
                    <p className="text-[10px] text-brand-gray-400">Ceiling of points redeemable in one order</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={redemption.loyalty_max_points_per_order}
                        onChange={(e) => updateRedemption("loyalty_max_points_per_order", e.target.value)}
                        className="w-24 rounded-lg border border-brand-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-black text-center focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
                      />
                      <span className="text-xs text-brand-gray-400">points</span>
                    </div>
                  </div>
                </div>

                {/* Max order percentage */}
                <div className="bg-brand-gray-50 rounded-xl p-4 space-y-2">
                  <label className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide">Max Order Coverage (%)</label>
                  <p className="text-[10px] text-brand-gray-400">Maximum percentage of the order total that can be covered by points</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={redemption.loyalty_max_order_pct}
                      onChange={(e) => updateRedemption("loyalty_max_order_pct", e.target.value)}
                      className="w-20 rounded-lg border border-brand-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-black text-center focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
                    />
                    <span className="text-sm font-bold text-brand-gray-600">%</span>
                    <span className="ml-auto text-xs text-brand-gray-400">
                      e.g. ₹500 order → max ₹{Math.round(500 * (parseFloat(redemption.loyalty_max_order_pct) || 0) / 100)} off
                    </span>
                  </div>
                </div>

                {/* Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-brand-gray-200">
                    <div>
                      <p className="text-xs font-semibold text-brand-black">Allow with Coupon</p>
                      <p className="text-[10px] text-brand-gray-400">Points can be used alongside coupon codes</p>
                    </div>
                    <button onClick={() => toggleRedemption("loyalty_allow_with_coupon")}>
                      {redemption.loyalty_allow_with_coupon === "true" ? (
                        <ToggleRight className="w-7 h-7 text-brand-green" />
                      ) : (
                        <ToggleLeft className="w-7 h-7 text-brand-gray-300" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-brand-gray-200">
                    <div>
                      <p className="text-xs font-semibold text-brand-black">Allow on Discounted Items</p>
                      <p className="text-[10px] text-brand-gray-400">Points apply even on items already discounted</p>
                    </div>
                    <button onClick={() => toggleRedemption("loyalty_allow_on_discounted")}>
                      {redemption.loyalty_allow_on_discounted === "true" ? (
                        <ToggleRight className="w-7 h-7 text-brand-green" />
                      ) : (
                        <ToggleLeft className="w-7 h-7 text-brand-gray-300" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-brand-gray-200">
                    <div>
                      <p className="text-xs font-semibold text-brand-black">Cover Tax</p>
                      <p className="text-[10px] text-brand-gray-400">Points can cover tax portion of order</p>
                    </div>
                    <button onClick={() => toggleRedemption("loyalty_cover_tax")}>
                      {redemption.loyalty_cover_tax === "true" ? (
                        <ToggleRight className="w-7 h-7 text-brand-green" />
                      ) : (
                        <ToggleLeft className="w-7 h-7 text-brand-gray-300" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-brand-gray-200">
                    <div>
                      <p className="text-xs font-semibold text-brand-black">Cover Packaging</p>
                      <p className="text-[10px] text-brand-gray-400">Points can cover packaging charges</p>
                    </div>
                    <button onClick={() => toggleRedemption("loyalty_cover_packaging")}>
                      {redemption.loyalty_cover_packaging === "true" ? (
                        <ToggleRight className="w-7 h-7 text-brand-green" />
                      ) : (
                        <ToggleLeft className="w-7 h-7 text-brand-gray-300" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── Analytics & Reports ─── */}
          <div className="bg-white rounded-2xl shadow-sm border border-brand-gray-100 p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-brand-black text-base">Analytics &amp; Reports</h3>
                <p className="text-xs text-brand-gray-500">Aggregate metrics on loyalty program performance</p>
              </div>
            </div>

            {analyticsLoading ? (
              <div className="flex items-center justify-center py-10"><Spinner size="lg" /></div>
            ) : analytics ? (
              <div className="space-y-4">
                {/* Metric cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide">Issued</p>
                    </div>
                    <p className="text-xl font-bold text-green-800">{analytics.total_points_issued.toLocaleString("en-IN")}</p>
                    <p className="text-[10px] text-green-600">points total</p>
                  </div>

                  <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-4 border border-red-200">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="w-4 h-4 text-red-600" />
                      <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">Redeemed</p>
                    </div>
                    <p className="text-xl font-bold text-red-800">{analytics.total_points_redeemed.toLocaleString("en-IN")}</p>
                    <p className="text-[10px] text-red-600">points total</p>
                  </div>

                  <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl p-4 border border-amber-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Coins className="w-4 h-4 text-amber-600" />
                      <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Liability</p>
                    </div>
                    <p className="text-xl font-bold text-amber-800">₹{analytics.outstanding_liability.toLocaleString("en-IN")}</p>
                    <p className="text-[10px] text-amber-600">{analytics.outstanding_points.toLocaleString("en-IN")} outstanding pts</p>
                  </div>

                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart3 className="w-4 h-4 text-blue-600" />
                      <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Redemption Rate</p>
                    </div>
                    <p className="text-xl font-bold text-blue-800">{analytics.redemption_rate}%</p>
                    <p className="text-[10px] text-blue-600">{analytics.accounts_with_redemptions} / {analytics.total_accounts} accounts</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-brand-gray-400 text-center py-4">No analytics data available</p>
            )}
          </div>

          {/* User Ratings */}
          <div className="bg-white rounded-2xl shadow-sm border border-brand-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-yellow/20 flex items-center justify-center shadow-sm">
                  <Star className="w-5 h-5 text-brand-yellow-dark" />
                </div>
                <div>
                  <h3 className="font-bold text-brand-black text-base">User Ratings</h3>
                  <p className="text-xs text-brand-gray-500">Ratings submitted by customers after completed orders</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold text-brand-gray-500 uppercase tracking-wide">Overall Rating</p>
                <p className="text-xl font-bold text-brand-black">
                  {ratings.length > 0 ? overallRating.toFixed(1) : "-"} <span className="text-sm text-brand-gray-400">/ 5</span>
                </p>
              </div>
            </div>

            {ratingsLoading ? (
              <div className="flex items-center justify-center py-10"><Spinner size="lg" /></div>
            ) : ratings.length === 0 ? (
              <p className="text-sm text-brand-gray-400 text-center py-8">No ratings submitted yet</p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto rounded-xl border border-brand-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-brand-gray-50 sticky top-0">
                    <tr className="text-left text-brand-gray-500 uppercase tracking-wide">
                      <th className="px-3 py-2 font-semibold">User</th>
                      <th className="px-3 py-2 font-semibold">Order</th>
                      <th className="px-3 py-2 font-semibold">Rating</th>
                      <th className="px-3 py-2 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-gray-100">
                    {ratings.map((rating) => (
                      <tr key={rating.id} className="hover:bg-brand-gray-50">
                        <td className="px-3 py-2 text-brand-gray-700 max-w-[180px] truncate">{rating.user_label}</td>
                        <td className="px-3 py-2 text-brand-gray-500">{rating.order_number ? `#${rating.order_number}` : rating.order_id}</td>
                        <td className="px-3 py-2 font-bold text-brand-yellow-dark">{rating.rating}/5 stars</td>
                        <td className="px-3 py-2 text-brand-gray-400 whitespace-nowrap">{formatDate(rating.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ─── Transaction Ledger ─── */}
          <div className="bg-white rounded-2xl shadow-sm border border-brand-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center shadow-sm">
                  <Search className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-brand-black text-base">Transaction Ledger</h3>
                  <p className="text-xs text-brand-gray-500">Chronological log of all point activity</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search by user, order, source..."
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="w-56 rounded-lg border border-brand-gray-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow placeholder:text-brand-gray-400"
                />
              </div>
            </div>

            {ledgerLoading ? (
              <div className="flex items-center justify-center py-10"><Spinner size="lg" /></div>
            ) : filteredLedger.length === 0 ? (
              <p className="text-sm text-brand-gray-400 text-center py-8">No transactions recorded yet</p>
            ) : (
              <div className="max-h-[400px] overflow-y-auto rounded-xl border border-brand-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-brand-gray-50 sticky top-0">
                    <tr className="text-left text-brand-gray-500 uppercase tracking-wide">
                      <th className="px-3 py-2 font-semibold">Type</th>
                      <th className="px-3 py-2 font-semibold">Points</th>
                      <th className="px-3 py-2 font-semibold">₹ Value</th>
                      <th className="px-3 py-2 font-semibold">Balance</th>
                      <th className="px-3 py-2 font-semibold">Source</th>
                      <th className="px-3 py-2 font-semibold">Description</th>
                      <th className="px-3 py-2 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-gray-100">
                    {filteredLedger.map((entry) => (
                      <tr key={entry.id} className="hover:bg-brand-gray-50">
                        <td className="px-3 py-2">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-bold",
                            entry.type === "earn" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}>
                            {entry.type === "earn" ? "EARN" : "REDEEM"}
                          </span>
                        </td>
                        <td className={cn("px-3 py-2 font-bold", entry.type === "earn" ? "text-green-700" : "text-red-600")}>
                          {entry.type === "earn" ? "+" : "-"}{entry.points}
                        </td>
                        <td className="px-3 py-2 text-brand-gray-600">{entry.monetary_value == null ? "-" : `₹${entry.monetary_value.toFixed(2)}`}</td>
                        <td className="px-3 py-2 font-medium text-brand-black">{entry.balance_after ?? "-"}</td>
                        <td className="px-3 py-2 text-brand-gray-500">{entry.source}</td>
                        <td className="px-3 py-2 text-brand-gray-600 max-w-[150px] truncate">{entry.description}</td>
                        <td className="px-3 py-2 text-brand-gray-400 whitespace-nowrap">{formatDate(entry.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ==================== REFERRAL ==================== */}
      {section === "referral" && (
        <div className="bg-white rounded-2xl shadow-sm border border-brand-gray-100 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-yellow/20 flex items-center justify-center">
                <Star className="w-5 h-5 text-brand-yellow-dark" />
              </div>
              <div>
                <h3 className="font-bold text-brand-black text-base">Referral Program</h3>
                <p className="text-xs text-brand-gray-500">Set the bonuses shown to users in the referral program</p>
              </div>
            </div>
            <Button size="sm" loading={referralSaving} onClick={saveReferralProgram}>
              Save
            </Button>
          </div>

          {referralLoading ? (
            <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
          ) : (
            <div className="space-y-5">
              <Input
                label="Program Name"
                value={referralForm.name}
                onChange={(e) => setReferralForm({ ...referralForm, name: e.target.value })}
                placeholder="Refer & Earn"
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Referrer Points Bonus"
                  type="number"
                  min="0"
                  value={referralForm.referrer_bonus_points}
                  onChange={(e) => setReferralForm({ ...referralForm, referrer_bonus_points: e.target.value })}
                />
                <Input
                  label="New User Points Bonus"
                  type="number"
                  min="0"
                  value={referralForm.referee_bonus_points}
                  onChange={(e) => setReferralForm({ ...referralForm, referee_bonus_points: e.target.value })}
                />
                <Input
                  label="Referrer Wallet Bonus"
                  type="number"
                  min="0"
                  step="0.01"
                  value={referralForm.referrer_wallet_bonus}
                  onChange={(e) => setReferralForm({ ...referralForm, referrer_wallet_bonus: e.target.value })}
                />
              </div>

              <div className="bg-brand-gray-50 rounded-xl p-4 border border-brand-gray-100 space-y-3">
                <p className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide">Give Referral Points</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setReferralForm({ ...referralForm, reward_trigger: "signup" })}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left transition-colors",
                      referralForm.reward_trigger === "signup"
                        ? "border-brand-yellow bg-brand-yellow/10"
                        : "border-brand-gray-200 bg-white hover:bg-brand-gray-50"
                    )}
                  >
                    <p className="text-sm font-bold text-brand-black">On user signup</p>
                    <p className="text-xs text-brand-gray-500 mt-0.5">Award as soon as the referral code is applied</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReferralForm({ ...referralForm, reward_trigger: "first_order" })}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left transition-colors",
                      referralForm.reward_trigger === "first_order"
                        ? "border-brand-yellow bg-brand-yellow/10"
                        : "border-brand-gray-200 bg-white hover:bg-brand-gray-50"
                    )}
                  >
                    <p className="text-sm font-bold text-brand-black">After first order</p>
                    <p className="text-xs text-brand-gray-500 mt-0.5">Award after the referred user&apos;s first picked up order</p>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  type="datetime-local"
                  value={referralForm.starts_at}
                  onChange={(e) => setReferralForm({ ...referralForm, starts_at: e.target.value })}
                />
                <Input
                  label="End Date"
                  type="datetime-local"
                  value={referralForm.ends_at}
                  onChange={(e) => setReferralForm({ ...referralForm, ends_at: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-brand-gray-50 rounded-xl border border-brand-gray-100">
                <div>
                  <p className="text-sm font-bold text-brand-black">Referral Program Status</p>
                  <p className="text-xs text-brand-gray-500">Only active programs inside the date range appear for users</p>
                </div>
                <button onClick={() => setReferralForm((prev) => ({ ...prev, is_active: !prev.is_active }))}>
                  {referralForm.is_active ? (
                    <ToggleRight className="w-8 h-8 text-brand-green" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-brand-gray-300" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== ACTIONS ==================== */}
      {section === "actions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-gray-500">{actions.length} action{actions.length !== 1 ? "s" : ""}</p>
            <Button onClick={openActionAdd} size="sm">
              <Plus className="w-4 h-4" />
              Add Action
            </Button>
          </div>

          {actionsLoading ? (
            <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
          ) : actions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-brand-gray-400">
              <Trophy className="w-12 h-12 mb-3" />
              <p className="font-semibold">No actions configured</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 divide-y divide-brand-gray-100">
              {actions.map((action) => (
                <div key={action.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-brand-black">{action.name}</p>
                      <Badge variant="info">{action.event_type}</Badge>
                    </div>
                    <p className="text-sm text-brand-gray-500 mt-0.5">
                      {action.points} pts{action.max_per_day != null ? ` (max ${action.max_per_day}/day)` : ""} &mdash; {action.description}
                    </p>
                  </div>
                  <button onClick={() => toggleActionActive(action)} title="Toggle active">
                    {action.is_active ? <ToggleRight className="w-7 h-7 text-brand-green" /> : <ToggleLeft className="w-7 h-7 text-brand-gray-300" />}
                  </button>
                  <button onClick={() => openActionEdit(action)} className="p-2 rounded-lg hover:bg-brand-gray-100 text-brand-gray-500 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Points Percentage Configuration */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-brand-black text-sm">Points % Configuration</h3>
                <p className="text-xs text-brand-gray-500 mt-0.5">
                  Set the percentage of amount to award as points for these actions
                </p>
              </div>
              <Button size="sm" loading={pctSaving} onClick={savePointsPct}>
                Save
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-brand-gray-50 rounded-lg p-4">
                <label className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide">
                  Wallet Top-up
                </label>
                <p className="text-[10px] text-brand-gray-400 mt-0.5 mb-2">
                  % of top-up amount awarded as points
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={pctWalletTopup}
                    onChange={(e) => setPctWalletTopup(e.target.value)}
                    className="w-20 rounded-lg border border-brand-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-black text-center focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
                  />
                  <span className="text-sm font-bold text-brand-gray-600">%</span>
                  <span className="ml-auto text-xs text-brand-gray-400">
                    e.g. ₹500 top-up → {Math.round(500 * (parseFloat(pctWalletTopup) || 0) / 100)} pts
                  </span>
                </div>
              </div>
              <div className="bg-brand-gray-50 rounded-lg p-4">
                <label className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide">
                  Place an Order
                </label>
                <p className="text-[10px] text-brand-gray-400 mt-0.5 mb-2">
                  % of order amount awarded as points
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={pctOrderPlaced}
                    onChange={(e) => setPctOrderPlaced(e.target.value)}
                    className="w-20 rounded-lg border border-brand-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-black text-center focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
                  />
                  <span className="text-sm font-bold text-brand-gray-600">%</span>
                  <span className="ml-auto text-xs text-brand-gray-400">
                    e.g. ₹300 order → {Math.round(300 * (parseFloat(pctOrderPlaced) || 0) / 100)} pts
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Modal */}
          <Modal open={actionModal} onClose={() => setActionModal(false)} title={editingAction ? "Edit Action" : "Add Action"} className="max-w-lg">
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <Input label="Name" value={actionForm.name} onChange={(e) => setActionForm({ ...actionForm, name: e.target.value })} placeholder="e.g. Place Order" />
              <Input label="Slug" value={actionForm.slug} onChange={(e) => setActionForm({ ...actionForm, slug: e.target.value })} placeholder="place_order" />
              <Input label="Description" value={actionForm.description} onChange={(e) => setActionForm({ ...actionForm, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Points" type="number" value={actionForm.points} onChange={(e) => setActionForm({ ...actionForm, points: e.target.value })} />
                <Input label="Event Type" value={actionForm.event_type} onChange={(e) => setActionForm({ ...actionForm, event_type: e.target.value })} placeholder="order_placed" />
              </div>
              <Input label="Max Per Day (blank = unlimited)" type="number" value={actionForm.max_per_day} onChange={(e) => setActionForm({ ...actionForm, max_per_day: e.target.value })} />
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={actionForm.is_active} onChange={(e) => setActionForm({ ...actionForm, is_active: e.target.checked })} className="w-4 h-4 rounded border-brand-gray-300 text-brand-yellow focus:ring-brand-yellow" />
                <span className="text-sm font-medium text-brand-gray-700">Active</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
              <Button variant="ghost" size="sm" onClick={() => setActionModal(false)}>Cancel</Button>
              <Button size="sm" loading={actionSaving} onClick={saveAction}>{editingAction ? "Update" : "Add"}</Button>
            </div>
          </Modal>
        </div>
      )}

      {/* ==================== MISSIONS ==================== */}
      {section === "missions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-gray-500">{missions.length} mission{missions.length !== 1 ? "s" : ""}</p>
            <Button onClick={openMissionAdd} size="sm">
              <Plus className="w-4 h-4" />
              Add Mission
            </Button>
          </div>

          {missionsLoading ? (
            <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
          ) : missions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-brand-gray-400">
              <Target className="w-12 h-12 mb-3" />
              <p className="font-semibold">No missions configured</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 divide-y divide-brand-gray-100">
              {missions.map((mission) => (
                <div key={mission.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-brand-black">{mission.name}</p>
                      <Badge variant="info">{mission.type}</Badge>
                      <Badge variant="default">{mission.reward_type}</Badge>
                    </div>
                    <p className="text-sm text-brand-gray-500 mt-0.5">
                      Target: {mission.target_count}x {mission.target_event} &mdash; Reward: {mission.reward_points} pts
                    </p>
                    <p className="text-xs text-brand-gray-400 mt-0.5">
                      {formatDate(mission.starts_at)}
                      {mission.ends_at ? ` - ${formatDate(mission.ends_at)}` : " (no end)"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => toggleMissionActive(mission)} title="Toggle active">
                      {mission.is_active ? <ToggleRight className="w-7 h-7 text-brand-green" /> : <ToggleLeft className="w-7 h-7 text-brand-gray-300" />}
                    </button>
                    <button onClick={() => openMissionEdit(mission)} className="p-2 rounded-lg hover:bg-brand-gray-100 text-brand-gray-500 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Mission Modal */}
          <Modal open={missionModal} onClose={() => setMissionModal(false)} title={editingMission ? "Edit Mission" : "Add Mission"} className="max-w-lg">
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <Input label="Name" value={missionForm.name} onChange={(e) => setMissionForm({ ...missionForm, name: e.target.value })} placeholder="e.g. Order 5 Bowls" />
              <Input label="Description" value={missionForm.description} onChange={(e) => setMissionForm({ ...missionForm, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-brand-gray-700">Type</label>
                  <select value={missionForm.type} onChange={(e) => setMissionForm({ ...missionForm, type: e.target.value as Mission["type"] })} className="w-full rounded-xl border border-brand-gray-300 bg-white px-4 py-2.5 text-base text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow">
                    <option value="one_time">One Time</option>
                    <option value="recurring">Recurring</option>
                    <option value="streak">Streak</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-brand-gray-700">Reward Type</label>
                  <select value={missionForm.reward_type} onChange={(e) => setMissionForm({ ...missionForm, reward_type: e.target.value as Mission["reward_type"] })} className="w-full rounded-xl border border-brand-gray-300 bg-white px-4 py-2.5 text-base text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow">
                    <option value="points">Points</option>
                    <option value="coupon">Coupon</option>
                    <option value="badge">Badge</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Target Event" value={missionForm.target_event} onChange={(e) => setMissionForm({ ...missionForm, target_event: e.target.value })} placeholder="order_placed" />
                <Input label="Target Count" type="number" value={missionForm.target_count} onChange={(e) => setMissionForm({ ...missionForm, target_count: e.target.value })} />
              </div>
              <Input label="Reward Points" type="number" value={missionForm.reward_points} onChange={(e) => setMissionForm({ ...missionForm, reward_points: e.target.value })} />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-brand-gray-700">Reward Value (JSON)</label>
                <textarea
                  value={missionForm.reward_value}
                  onChange={(e) => setMissionForm({ ...missionForm, reward_value: e.target.value })}
                  rows={3}
                  className="w-full rounded-xl border border-brand-gray-300 bg-white px-4 py-2.5 text-sm font-mono text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Start Date" type="datetime-local" value={missionForm.starts_at} onChange={(e) => setMissionForm({ ...missionForm, starts_at: e.target.value })} />
                <Input label="End Date (optional)" type="datetime-local" value={missionForm.ends_at} onChange={(e) => setMissionForm({ ...missionForm, ends_at: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={missionForm.is_active} onChange={(e) => setMissionForm({ ...missionForm, is_active: e.target.checked })} className="w-4 h-4 rounded border-brand-gray-300 text-brand-yellow focus:ring-brand-yellow" />
                <span className="text-sm font-medium text-brand-gray-700">Active</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
              <Button variant="ghost" size="sm" onClick={() => setMissionModal(false)}>Cancel</Button>
              <Button size="sm" loading={missionSaving} onClick={saveMission}>{editingMission ? "Update" : "Add"}</Button>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}
