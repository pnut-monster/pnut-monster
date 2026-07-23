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
  ShieldCheck,
  Mail,
} from "lucide-react";
import toast from "react-hot-toast";

export default function AdminSettingsPage() {
  const [taxRate, setTaxRate] = useState("");
  const [packagingCharge, setPackagingCharge] = useState("");
  const [packagingMode, setPackagingMode] = useState<"per_order" | "per_item">("per_order");
  const [require2fa, setRequire2fa] = useState(true);
  const [saving2fa, setSaving2fa] = useState(false);
  const [mfaUserEmail, setMfaUserEmail] = useState("");
  const [savingMfaEmail, setSavingMfaEmail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["tax_rate", "packaging_charge", "packaging_mode", "require_2fa", "mfa_user_email"]);
      if (data) {
        for (const row of data as { key: string; value: string }[]) {
          if (row.key === "tax_rate") setTaxRate(String(parseFloat(row.value) * 100));
          if (row.key === "packaging_charge") setPackagingCharge(row.value);
          if (row.key === "packaging_mode") setPackagingMode(row.value as "per_order" | "per_item");
          if (row.key === "require_2fa") setRequire2fa(row.value !== "false");
          if (row.key === "mfa_user_email") setMfaUserEmail(row.value);
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

  const handleToggle2fa = async () => {
    setSaving2fa(true);
    const newValue = !require2fa;
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "require_2fa", value: String(newValue) }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update");
      }
      setRequire2fa(newValue);
      toast.success(
        newValue
          ? "Two-factor authentication enabled"
          : "Two-factor authentication disabled"
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update 2FA setting");
    }
    setSaving2fa(false);
  };

  const handleSaveMfaEmail = async () => {
    setSavingMfaEmail(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "mfa_user_email", value: mfaUserEmail.trim() }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update");
      }
      toast.success("Authentication user email updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update email");
    }
    setSavingMfaEmail(false);
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

      {/* Security - 2FA Toggle */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-brand-black">
              Security
            </h2>
            <p className="text-sm text-brand-gray-500">
              Manage two-factor authentication for admin login
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-brand-black">
              Require Two-Factor Authentication (2FA)
            </p>
            <p className="text-xs text-brand-gray-400 mt-0.5">
              {require2fa
                ? "Admins must verify with authenticator app after login"
                : "Admins can login with just email and password"}
            </p>
          </div>
          <button
            type="button"
            disabled={saving2fa}
            onClick={handleToggle2fa}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              require2fa ? "bg-green-500" : "bg-brand-gray-300"
            } ${saving2fa ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                require2fa ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {!require2fa && (
          <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Warning: Disabling 2FA reduces account security. Admins will be able to access the panel with only a password.
            </p>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-brand-gray-100">
          <p className="text-sm font-medium text-brand-black">
            Authentication User (receives 2FA codes)
          </p>
          <p className="text-xs text-brand-gray-400 mt-0.5 mb-3">
            Change the email of the user whose authenticator app is used for admin 2FA verification
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                type="email"
                value={mfaUserEmail}
                onChange={(e) => setMfaUserEmail(e.target.value)}
                placeholder="admin@pnutmonster.com"
                icon={<Mail className="w-4 h-4" />}
              />
            </div>
            <Button
              size="sm"
              loading={savingMfaEmail}
              onClick={handleSaveMfaEmail}
            >
              <Save className="w-4 h-4" />
              Save
            </Button>
          </div>
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
