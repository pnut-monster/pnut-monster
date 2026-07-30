// @ts-nocheck — batch tables not yet in generated types; remove after running migrations + type gen
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Spinner } from "@/components/ui";
import { Save, Timer, Building2 } from "lucide-react";
import toast from "react-hot-toast";

type Outlet = {
  id: string;
  name: string;
  batch_config: Record<string, unknown> | null;
};

export default function AdminBatchSettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Global settings
  const [slotTimer, setSlotTimer] = useState("180");

  // Per-outlet settings
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<string>("");
  const [outletConfig, setOutletConfig] = useState({
    default_delivery_fee: "0",
    label_format: "thermal",
    default_commission_type: "flat_per_order",
    default_commission_value: "5",
    counter_display_mode: "exact",
    counter_visual_style: "static",
  });
  const [savingOutlet, setSavingOutlet] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [settingsRes, outletRes] = await Promise.all([
      supabase.from("app_settings").select("key, value").in("key", ["batch_slot_timer_seconds"]),
      supabase.from("outlets").select("id, name, batch_config").order("name"),
    ]);
    if (settingsRes.data) {
      for (const row of settingsRes.data as { key: string; value: string }[]) {
        if (row.key === "batch_slot_timer_seconds") setSlotTimer(row.value);
      }
    }
    if (outletRes.data) {
      setOutlets(outletRes.data as Outlet[]);
      if (outletRes.data.length > 0 && !selectedOutlet) {
        setSelectedOutlet(outletRes.data[0].id);
        loadOutletConfig(outletRes.data[0] as Outlet);
      }
    }
    setLoading(false);
  }, [supabase, selectedOutlet]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function loadOutletConfig(outlet: Outlet) {
    const cfg = outlet.batch_config || {};
    setOutletConfig({
      default_delivery_fee: String(cfg.default_delivery_fee ?? "0"),
      label_format: String(cfg.label_format ?? "thermal"),
      default_commission_type: String(cfg.default_commission_type ?? "flat_per_order"),
      default_commission_value: String(cfg.default_commission_value ?? "5"),
      counter_display_mode: String(cfg.counter_display_mode ?? "exact"),
      counter_visual_style: String(cfg.counter_visual_style ?? "static"),
    });
  }

  async function saveGlobalSettings() {
    setSaving(true);
    const { error } = await supabase.from("app_settings")
      .upsert({ key: "batch_slot_timer_seconds", value: slotTimer }, { onConflict: "key" });
    if (error) toast.error(error.message);
    else toast.success("Global settings saved");
    setSaving(false);
  }

  async function saveOutletConfig() {
    if (!selectedOutlet) return;
    setSavingOutlet(true);
    const config = {
      default_delivery_fee: parseFloat(outletConfig.default_delivery_fee) || 0,
      label_format: outletConfig.label_format,
      default_commission_type: outletConfig.default_commission_type,
      default_commission_value: parseFloat(outletConfig.default_commission_value) || 0,
      counter_display_mode: outletConfig.counter_display_mode,
      counter_visual_style: outletConfig.counter_visual_style,
    };
    const { error } = await supabase.from("outlets")
      .update({ batch_config: config })
      .eq("id", selectedOutlet);
    if (error) toast.error(error.message);
    else toast.success("Outlet batch config saved");
    setSavingOutlet(false);
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Global Settings */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Timer size={20} className="text-brand-green" />
          <h2 className="text-lg font-bold text-gray-900">Global Batch Settings</h2>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <Input
            label="Slot Reservation Timer (seconds)"
            type="number"
            value={slotTimer}
            onChange={e => setSlotTimer(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            How long a customer&apos;s slot is held during checkout (IRCTC-style). Default: 180 seconds (3 minutes).
          </p>
          <Button onClick={saveGlobalSettings} disabled={saving} size="sm" className="gap-2">
            <Save size={14} /> {saving ? "Saving..." : "Save Global Settings"}
          </Button>
        </div>
      </section>

      {/* Per-Outlet Settings */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={20} className="text-brand-green" />
          <h2 className="text-lg font-bold text-gray-900">Per-Outlet Batch Defaults</h2>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet</label>
            <select value={selectedOutlet}
              onChange={e => {
                setSelectedOutlet(e.target.value);
                const outlet = outlets.find(o => o.id === e.target.value);
                if (outlet) loadOutletConfig(outlet);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          <Input label="Default Delivery Fee (₹)" type="number" value={outletConfig.default_delivery_fee}
            onChange={e => setOutletConfig(c => ({ ...c, default_delivery_fee: e.target.value }))} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Label Format</label>
              <select value={outletConfig.label_format}
                onChange={e => setOutletConfig(c => ({ ...c, label_format: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
                <option value="thermal">Thermal (80mm)</option>
                <option value="a4">A4 Sheet (8 per page)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Counter Display</label>
              <select value={outletConfig.counter_display_mode}
                onChange={e => setOutletConfig(c => ({ ...c, counter_display_mode: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
                <option value="exact">Exact Numbers</option>
                <option value="urgency">Vague Urgency</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Counter Style</label>
              <select value={outletConfig.counter_visual_style}
                onChange={e => setOutletConfig(c => ({ ...c, counter_visual_style: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
                <option value="static">Static</option>
                <option value="animated">Animated</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Commission Type</label>
              <select value={outletConfig.default_commission_type}
                onChange={e => setOutletConfig(c => ({ ...c, default_commission_type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
                <option value="flat_per_order">Flat per Order</option>
                <option value="percentage">Percentage</option>
                <option value="flat_per_batch">Flat per Batch</option>
              </select>
            </div>
          </div>

          <Input label={outletConfig.default_commission_type === "percentage" ? "Default Commission (%)" : "Default Commission (₹)"}
            type="number" value={outletConfig.default_commission_value}
            onChange={e => setOutletConfig(c => ({ ...c, default_commission_value: e.target.value }))} />

          <Button onClick={saveOutletConfig} disabled={savingOutlet} size="sm" className="gap-2">
            <Save size={14} /> {savingOutlet ? "Saving..." : "Save Outlet Config"}
          </Button>
        </div>
      </section>
    </div>
  );
}
