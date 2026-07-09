"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/utils/constants";
import { Input, Button, Spinner } from "@/components/ui";
import {
  Settings,
  Percent,
  Package,
  Info,
  Save,
} from "lucide-react";
import toast from "react-hot-toast";

export default function AdminSettingsPage() {
  const [taxRate, setTaxRate] = useState("");
  const [packagingCharge, setPackagingCharge] = useState("");
  const [packagingMode, setPackagingMode] = useState<"per_order" | "per_item">("per_order");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["tax_rate", "packaging_charge", "packaging_mode"]);
      if (data) {
        for (const row of data as { key: string; value: string }[]) {
          if (row.key === "tax_rate") setTaxRate(String(parseFloat(row.value) * 100));
          if (row.key === "packaging_charge") setPackagingCharge(row.value);
          if (row.key === "packaging_mode") setPackagingMode(row.value as "per_order" | "per_item");
        }
      }
      setLoading(false);
    }
    loadSettings();
  }, [supabase]);

  const handleSave = async () => {
    setSaving(true);
    const taxValue = parseFloat(taxRate) / 100;
    const packagingValue = parseFloat(packagingCharge);

    if (isNaN(taxValue) || isNaN(packagingValue)) {
      toast.error("Please enter valid numbers");
      setSaving(false);
      return;
    }

    const { error: e1 } = await supabase
      .from("app_settings")
      .update({ value: String(taxValue), updated_at: new Date().toISOString() } as never)
      .eq("key", "tax_rate");

    const { error: e2 } = await supabase
      .from("app_settings")
      .update({ value: String(packagingValue), updated_at: new Date().toISOString() } as never)
      .eq("key", "packaging_charge");

    const { error: e3 } = await supabase
      .from("app_settings")
      .update({ value: packagingMode, updated_at: new Date().toISOString() } as never)
      .eq("key", "packaging_mode");

    if (e1 || e2 || e3) {
      toast.error("Failed to save settings");
    } else {
      toast.success("Settings saved successfully");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Tax & Charges */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-brand-yellow/10 flex items-center justify-center">
            <Percent className="w-5 h-5 text-brand-yellow-dark" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-brand-black">
              Tax & Charges
            </h2>
            <p className="text-sm text-brand-gray-500">
              Configure tax rate and packaging charges
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Tax Rate (%)"
            type="number"
            step="0.1"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            icon={<Percent className="w-4 h-4" />}
          />
          <Input
            label="Packaging Charge (INR)"
            type="number"
            value={packagingCharge}
            onChange={(e) => setPackagingCharge(e.target.value)}
            icon={<Package className="w-4 h-4" />}
          />
        </div>

        <div className="mt-4">
          <label className="text-sm font-semibold text-brand-gray-700 mb-2 block">
            Packaging Charge Mode
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPackagingMode("per_order")}
              className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                packagingMode === "per_order"
                  ? "border-brand-yellow bg-brand-yellow/10 text-brand-yellow-dark"
                  : "border-brand-gray-200 bg-white text-brand-gray-600 hover:border-brand-gray-300"
              }`}
            >
              Per Order
            </button>
            <button
              type="button"
              onClick={() => setPackagingMode("per_item")}
              className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                packagingMode === "per_item"
                  ? "border-brand-yellow bg-brand-yellow/10 text-brand-yellow-dark"
                  : "border-brand-gray-200 bg-white text-brand-gray-600 hover:border-brand-gray-300"
              }`}
            >
              Per Item
            </button>
          </div>
          <p className="text-xs text-brand-gray-400 mt-1.5">
            {packagingMode === "per_order"
              ? "Same packaging fee regardless of number of items"
              : "Packaging fee applied to each item in the order"}
          </p>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <Button size="sm" loading={saving} onClick={handleSave}>
            <Save className="w-4 h-4" />
            Save Changes
          </Button>
        </div>
      </div>

      {/* App Info */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <Info className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-brand-black">
              App Information
            </h2>
            <p className="text-sm text-brand-gray-500">
              General application details
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {[
            ["App Name", APP_NAME],
            ["Version", "1.0.0"],
            ["Framework", "Next.js 15 (App Router)"],
            ["Database", "Supabase (PostgreSQL)"],
            ["Payments", "Razorpay (planned)"],
            ["Platform", "PWA (Progressive Web App)"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between py-2 border-b border-brand-gray-100 last:border-0"
            >
              <span className="text-sm font-medium text-brand-gray-500">
                {label}
              </span>
              <span className="text-sm font-semibold text-brand-black">
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone placeholder */}
      <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
            <Settings className="w-5 h-5 text-brand-red" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-brand-black">
              Danger Zone
            </h2>
            <p className="text-sm text-brand-gray-500">
              Destructive actions - handle with care
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-brand-black">
              Clear all test data
            </p>
            <p className="text-xs text-brand-gray-400 mt-0.5">
              Remove all orders, customers, and transaction data
            </p>
          </div>
          <Button variant="danger" size="sm" disabled>
            Clear Data
          </Button>
        </div>
      </div>
    </div>
  );
}
