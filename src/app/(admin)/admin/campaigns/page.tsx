"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campaign } from "@/lib/supabase/types";
import { formatDate, cn } from "@/lib/utils/helpers";
import { Button, Input, Modal, Badge, Spinner } from "@/components/ui";
import {
  Plus,
  Pencil,
  Megaphone,
  ToggleLeft,
  ToggleRight,
  Calendar,
} from "lucide-react";

type CampaignType = Campaign["type"];

type CampaignForm = {
  name: string;
  type: CampaignType;
  config: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

const EMPTY_FORM: CampaignForm = {
  name: "",
  type: "wallet_topup_bonus",
  config: '{\n  "bonus_percentage": 10\n}',
  starts_at: "",
  ends_at: "",
  is_active: true,
};

const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  wallet_topup_bonus: "Wallet Top-up Bonus",
  referral: "Referral",
  birthday: "Birthday",
  first_order: "First Order",
};

const CAMPAIGN_TYPE_VARIANT: Record<CampaignType, "default" | "success" | "warning" | "danger" | "info"> = {
  wallet_topup_bonus: "success",
  referral: "info",
  birthday: "warning",
  first_order: "default",
};

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState("");
  const supabase = createClient();

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    setCampaigns((data as Campaign[] | null) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchCampaigns(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchCampaigns]);

  const openAdd = () => {
    setEditingCampaign(null);
    setForm(EMPTY_FORM);
    setConfigError("");
    setModalOpen(true);
  };

  const openEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setForm({
      name: campaign.name,
      type: campaign.type,
      config: JSON.stringify(campaign.config, null, 2),
      starts_at: campaign.starts_at.slice(0, 16), // datetime-local format
      ends_at: campaign.ends_at.slice(0, 16),
      is_active: campaign.is_active,
    });
    setConfigError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.starts_at || !form.ends_at) return;

    let configParsed;
    try {
      configParsed = JSON.parse(form.config);
      setConfigError("");
    } catch {
      setConfigError("Invalid JSON");
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name,
      type: form.type,
      config: configParsed,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      is_active: form.is_active,
    };

    if (editingCampaign) {
      await supabase
        .from("campaigns")
        .update(payload as never)
        .eq("id", editingCampaign.id);
    } else {
      await supabase.from("campaigns").insert(payload as never);
    }

    setSaving(false);
    setModalOpen(false);
    fetchCampaigns();
  };

  const toggleActive = async (campaign: Campaign) => {
    await supabase
      .from("campaigns")
      .update({ is_active: !campaign.is_active } as never)
      .eq("id", campaign.id);
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaign.id ? { ...c, is_active: !c.is_active } : c
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-gray-500">
          {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={openAdd} size="sm">
          <Plus className="w-4 h-4" />
          Create Campaign
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {/* Empty */}
      {!loading && campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-brand-gray-400">
          <Megaphone className="w-12 h-12 mb-3" />
          <p className="text-base font-semibold">No campaigns yet</p>
          <p className="text-sm mt-1">Create your first campaign</p>
        </div>
      )}

      {/* Campaign List */}
      {!loading && campaigns.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 divide-y divide-brand-gray-100">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-brand-black">
                    {campaign.name}
                  </p>
                  <Badge variant={CAMPAIGN_TYPE_VARIANT[campaign.type]}>
                    {CAMPAIGN_TYPE_LABELS[campaign.type]}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-sm text-brand-gray-500">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {formatDate(campaign.starts_at)} &ndash;{" "}
                    {formatDate(campaign.ends_at)}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={cn(
                    "text-xs font-semibold px-2.5 py-1 rounded-full",
                    campaign.is_active
                      ? "bg-green-100 text-brand-green-dark"
                      : "bg-brand-gray-100 text-brand-gray-500"
                  )}
                >
                  {campaign.is_active ? "Active" : "Inactive"}
                </span>
                <button
                  onClick={() => toggleActive(campaign)}
                  title="Toggle active"
                >
                  {campaign.is_active ? (
                    <ToggleRight className="w-7 h-7 text-brand-green" />
                  ) : (
                    <ToggleLeft className="w-7 h-7 text-brand-gray-300" />
                  )}
                </button>
                <button
                  onClick={() => openEdit(campaign)}
                  className="p-2 rounded-lg hover:bg-brand-gray-100 transition-colors text-brand-gray-500"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCampaign ? "Edit Campaign" : "Create Campaign"}
        className="max-w-lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <Input
            label="Campaign Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Diwali Bonus"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-brand-gray-700">
              Type
            </label>
            <select
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as CampaignType })
              }
              className="w-full rounded-xl border border-brand-gray-300 bg-white px-4 py-2.5 text-base text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
            >
              {(
                Object.keys(CAMPAIGN_TYPE_LABELS) as CampaignType[]
              ).map((key) => (
                <option key={key} value={key}>
                  {CAMPAIGN_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-brand-gray-700">
              Config (JSON)
            </label>
            <textarea
              value={form.config}
              onChange={(e) => {
                setForm({ ...form, config: e.target.value });
                setConfigError("");
              }}
              rows={5}
              className={cn(
                "w-full rounded-xl border bg-white px-4 py-2.5 text-sm font-mono text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow",
                configError
                  ? "border-brand-red focus:ring-brand-red"
                  : "border-brand-gray-300"
              )}
            />
            {configError && (
              <p className="text-sm text-brand-red">{configError}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) =>
                setForm({ ...form, starts_at: e.target.value })
              }
            />
            <Input
              label="End Date"
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.checked })
              }
              className="w-4 h-4 rounded border-brand-gray-300 text-brand-yellow focus:ring-brand-yellow"
            />
            <span className="text-sm font-medium text-brand-gray-700">
              Active
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setModalOpen(false)}
          >
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={handleSave}>
            {editingCampaign ? "Update" : "Create"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
