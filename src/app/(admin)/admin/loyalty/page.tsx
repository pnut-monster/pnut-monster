"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LoyaltyTier, Mission } from "@/lib/supabase/types";
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
];

// ===================== TIERS =====================

type TierForm = {
  name: string;
  slug: string;
  min_lifetime_points: string;
  multiplier: string;
  benefits: string;
  sort_order: string;
};

const EMPTY_TIER_FORM: TierForm = {
  name: "",
  slug: "",
  min_lifetime_points: "0",
  multiplier: "1",
  benefits: '["Free delivery"]',
  sort_order: "0",
};

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

export default function AdminLoyaltyPage() {
  const [section, setSection] = useState("tiers");
  const supabase = createClient();

  // --- Tiers ---
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [tierModal, setTierModal] = useState(false);
  const [editingTier, setEditingTier] = useState<LoyaltyTier | null>(null);
  const [tierForm, setTierForm] = useState<TierForm>(EMPTY_TIER_FORM);
  const [tierSaving, setTierSaving] = useState(false);

  // --- Actions ---
  const [actions, setActions] = useState<LoyaltyAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [actionModal, setActionModal] = useState(false);
  const [editingAction, setEditingAction] = useState<LoyaltyAction | null>(null);
  const [actionForm, setActionForm] = useState<ActionForm>(EMPTY_ACTION_FORM);
  const [actionSaving, setActionSaving] = useState(false);

  // --- Missions ---
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(true);
  const [missionModal, setMissionModal] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [missionForm, setMissionForm] = useState<MissionForm>(EMPTY_MISSION_FORM);
  const [missionSaving, setMissionSaving] = useState(false);

  // ---- Fetch ----
  const fetchTiers = useCallback(async () => {
    setTiersLoading(true);
    const { data } = await supabase
      .from("loyalty_tiers")
      .select("*")
      .order("sort_order");
    setTiers((data as LoyaltyTier[] | null) ?? []);
    setTiersLoading(false);
  }, [supabase]);

  const fetchActions = useCallback(async () => {
    setActionsLoading(true);
    const { data } = await supabase
      .from("loyalty_actions")
      .select("*")
      .order("created_at", { ascending: false });
    setActions((data as LoyaltyAction[] | null) ?? []);
    setActionsLoading(false);
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

  useEffect(() => {
    fetchTiers();
    fetchActions();
    fetchMissions();
  }, [fetchTiers, fetchActions, fetchMissions]);

  // ===================== TIER HANDLERS =====================
  const openTierAdd = () => {
    setEditingTier(null);
    setTierForm(EMPTY_TIER_FORM);
    setTierModal(true);
  };

  const openTierEdit = (tier: LoyaltyTier) => {
    setEditingTier(tier);
    setTierForm({
      name: tier.name,
      slug: tier.slug,
      min_lifetime_points: String(tier.min_lifetime_points),
      multiplier: String(tier.multiplier),
      benefits: JSON.stringify(tier.benefits, null, 2),
      sort_order: String(tier.sort_order),
    });
    setTierModal(true);
  };

  const saveTier = async () => {
    if (!tierForm.name) return;
    setTierSaving(true);
    let benefitsParsed: Json;
    try {
      benefitsParsed = JSON.parse(tierForm.benefits);
    } catch {
      benefitsParsed = [];
    }
    const payload = {
      name: tierForm.name,
      slug: tierForm.slug || tierForm.name.toLowerCase().replace(/\s+/g, "_"),
      min_lifetime_points: parseInt(tierForm.min_lifetime_points) || 0,
      multiplier: parseFloat(tierForm.multiplier) || 1,
      benefits: benefitsParsed,
      sort_order: parseInt(tierForm.sort_order) || 0,
    };

    if (editingTier) {
      await supabase.from("loyalty_tiers").update(payload as never).eq("id", editingTier.id);
    } else {
      await supabase.from("loyalty_tiers").insert(payload as never);
    }
    setTierSaving(false);
    setTierModal(false);
    fetchTiers();
  };

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

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 px-2 pt-2">
        <Tabs tabs={SECTION_TABS} value={section} onChange={setSection} />
      </div>

      {/* ==================== TIERS ==================== */}
      {section === "tiers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-gray-500">{tiers.length} tier{tiers.length !== 1 ? "s" : ""}</p>
            <Button onClick={openTierAdd} size="sm">
              <Plus className="w-4 h-4" />
              Add Tier
            </Button>
          </div>

          {tiersLoading ? (
            <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
          ) : tiers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-brand-gray-400">
              <Star className="w-12 h-12 mb-3" />
              <p className="font-semibold">No tiers configured</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-gray-100 text-left">
                    <th className="px-5 py-3 font-semibold text-brand-gray-500">Tier</th>
                    <th className="px-5 py-3 font-semibold text-brand-gray-500">Min Points</th>
                    <th className="px-5 py-3 font-semibold text-brand-gray-500">Multiplier</th>
                    <th className="px-5 py-3 font-semibold text-brand-gray-500">Benefits</th>
                    <th className="px-5 py-3 font-semibold text-brand-gray-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-gray-100">
                  {tiers.map((tier) => (
                    <tr key={tier.id} className="hover:bg-brand-gray-50">
                      <td className="px-5 py-3 font-semibold text-brand-black">{tier.name}</td>
                      <td className="px-5 py-3 text-brand-gray-600">{tier.min_lifetime_points.toLocaleString()}</td>
                      <td className="px-5 py-3 text-brand-gray-600">{tier.multiplier}x</td>
                      <td className="px-5 py-3 text-brand-gray-600 max-w-xs truncate">
                        {Array.isArray(tier.benefits)
                          ? (tier.benefits as string[]).join(", ")
                          : JSON.stringify(tier.benefits)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => openTierEdit(tier)}
                          className="p-1.5 rounded-lg hover:bg-brand-gray-100 text-brand-gray-500 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tier Modal */}
          <Modal open={tierModal} onClose={() => setTierModal(false)} title={editingTier ? "Edit Tier" : "Add Tier"} className="max-w-lg">
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <Input label="Name" value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} placeholder="e.g. Sprout Star" />
              <Input label="Slug" value={tierForm.slug} onChange={(e) => setTierForm({ ...tierForm, slug: e.target.value })} placeholder="sprout_star" />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Min Lifetime Points" type="number" value={tierForm.min_lifetime_points} onChange={(e) => setTierForm({ ...tierForm, min_lifetime_points: e.target.value })} />
                <Input label="Multiplier" type="number" step="0.1" value={tierForm.multiplier} onChange={(e) => setTierForm({ ...tierForm, multiplier: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-brand-gray-700">Benefits (JSON array)</label>
                <textarea
                  value={tierForm.benefits}
                  onChange={(e) => setTierForm({ ...tierForm, benefits: e.target.value })}
                  rows={3}
                  className="w-full rounded-xl border border-brand-gray-300 bg-white px-4 py-2.5 text-sm font-mono text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
                />
              </div>
              <Input label="Sort Order" type="number" value={tierForm.sort_order} onChange={(e) => setTierForm({ ...tierForm, sort_order: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
              <Button variant="ghost" size="sm" onClick={() => setTierModal(false)}>Cancel</Button>
              <Button size="sm" loading={tierSaving} onClick={saveTier}>{editingTier ? "Update" : "Add"}</Button>
            </div>
          </Modal>
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
