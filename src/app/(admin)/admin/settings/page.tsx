"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
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
  Smartphone,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

type DeviceChangeStep = "idle" | "verify" | "scan" | "confirm" | "done";

export default function AdminSettingsPage() {
  const [taxRate, setTaxRate] = useState("");
  const [packagingCharge, setPackagingCharge] = useState("");
  const [packagingMode, setPackagingMode] = useState<"per_order" | "per_item">("per_order");
  const [require2fa, setRequire2fa] = useState(true);
  const [saving2fa, setSaving2fa] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Change 2FA device state
  const [deviceStep, setDeviceStep] = useState<DeviceChangeStep>("idle");
  const [devicePassword, setDevicePassword] = useState("");
  const [deviceCurrentCode, setDeviceCurrentCode] = useState("");
  const [deviceNewCode, setDeviceNewCode] = useState("");
  const [deviceQrCode, setDeviceQrCode] = useState("");
  const [deviceSecret, setDeviceSecret] = useState("");
  const [deviceFactorId, setDeviceFactorId] = useState("");
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceError, setDeviceError] = useState("");

  const supabase = createClient();

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["tax_rate", "packaging_charge", "packaging_mode", "require_2fa"]);
      if (data) {
        for (const row of data as { key: string; value: string }[]) {
          if (row.key === "tax_rate") setTaxRate(String(parseFloat(row.value) * 100));
          if (row.key === "packaging_charge") setPackagingCharge(row.value);
          if (row.key === "packaging_mode") setPackagingMode(row.value as "per_order" | "per_item");
          if (row.key === "require_2fa") setRequire2fa(row.value !== "false");
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

  const resetDeviceChange = () => {
    setDeviceStep("idle");
    setDevicePassword("");
    setDeviceCurrentCode("");
    setDeviceNewCode("");
    setDeviceQrCode("");
    setDeviceSecret("");
    setDeviceFactorId("");
    setDeviceLoading(false);
    setDeviceError("");
  };

  const handleVerifyIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devicePassword) {
      setDeviceError("Password is required");
      return;
    }
    if (!/^\d{6}$/.test(deviceCurrentCode)) {
      setDeviceError("Enter a valid 6-digit code from your current authenticator");
      return;
    }

    setDeviceLoading(true);
    setDeviceError("");
    try {
      const res = await fetch("/api/admin/change-2fa-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "verify-identity",
          password: devicePassword,
          totpCode: deviceCurrentCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");

      setDeviceQrCode(data.qrCode);
      setDeviceSecret(data.secret);
      setDeviceFactorId(data.factorId);
      setDeviceStep("scan");
    } catch (err: unknown) {
      setDeviceError(err instanceof Error ? err.message : "Verification failed");
    }
    setDeviceLoading(false);
  };

  const handleConfirmNewDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(deviceNewCode)) {
      setDeviceError("Enter the 6-digit code from your new authenticator");
      return;
    }

    setDeviceLoading(true);
    setDeviceError("");
    try {
      const res = await fetch("/api/admin/change-2fa-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "confirm-new-device",
          factorId: deviceFactorId,
          totpCode: deviceNewCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Confirmation failed");

      setDeviceStep("done");
      toast.success(data.message);
    } catch (err: unknown) {
      setDeviceError(err instanceof Error ? err.message : "Confirmation failed");
    }
    setDeviceLoading(false);
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-brand-black">
                Change 2FA Device
              </p>
              <p className="text-xs text-brand-gray-400 mt-0.5">
                Transfer your authenticator to a new phone by generating a new QR code
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDeviceStep("verify")}
            >
              <Smartphone className="w-4 h-4" />
              Change Device
            </Button>
          </div>
        </div>
      </div>

      {/* Change 2FA Device Modal */}
      {deviceStep !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={resetDeviceChange}
              className="absolute top-4 right-4 text-brand-gray-400 hover:text-brand-gray-700"
            >
              <X className="w-5 h-5" />
            </button>

            {deviceStep === "verify" && (
              <>
                <div className="text-center mb-6">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-yellow/15">
                    <ShieldCheck className="h-6 w-6 text-brand-yellow-dark" />
                  </div>
                  <h3 className="font-[family-name:var(--font-heading)] text-lg font-bold">
                    Verify Your Identity
                  </h3>
                  <p className="mt-1 text-sm text-brand-gray-500">
                    Enter your password and current 2FA code to proceed
                  </p>
                </div>

                <form onSubmit={handleVerifyIdentity} className="space-y-4">
                  <Input
                    label="Password"
                    type="password"
                    value={devicePassword}
                    onChange={(e) => setDevicePassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <Input
                    label="Current 2FA Code"
                    value={deviceCurrentCode}
                    onChange={(e) =>
                      setDeviceCurrentCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={6}
                    className="text-center font-mono text-lg tracking-[0.3em]"
                    autoComplete="one-time-code"
                  />

                  {deviceError && (
                    <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      {deviceError}
                    </div>
                  )}

                  <Button type="submit" loading={deviceLoading} className="w-full">
                    Verify Identity
                  </Button>
                </form>
              </>
            )}

            {deviceStep === "scan" && (
              <>
                <div className="text-center mb-6">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                    <Smartphone className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-[family-name:var(--font-heading)] text-lg font-bold">
                    Set Up New Device
                  </h3>
                  <p className="mt-1 text-sm text-brand-gray-500">
                    Scan this QR code with your new authenticator app
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="mx-auto w-fit rounded-xl border bg-white p-3">
                    <Image
                      src={deviceQrCode}
                      alt="New authenticator QR code"
                      width={200}
                      height={200}
                      unoptimized
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(deviceSecret);
                      toast.success("Setup key copied");
                    }}
                    className="flex w-full items-center justify-center gap-2 break-all rounded-lg bg-brand-gray-50 px-3 py-2 font-mono text-xs hover:bg-brand-gray-100 transition-colors"
                  >
                    <KeyRound className="h-4 w-4 shrink-0" />
                    {deviceSecret}
                  </button>
                  <p className="text-xs text-center text-brand-gray-400">
                    Or enter this key manually in your authenticator app
                  </p>

                  <form onSubmit={handleConfirmNewDevice} className="space-y-4 pt-2">
                    <Input
                      label="Code from new authenticator"
                      value={deviceNewCode}
                      onChange={(e) =>
                        setDeviceNewCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      inputMode="numeric"
                      placeholder="000000"
                      maxLength={6}
                      className="text-center font-mono text-lg tracking-[0.3em]"
                      autoComplete="one-time-code"
                      autoFocus
                    />

                    {deviceError && (
                      <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        {deviceError}
                      </div>
                    )}

                    <Button type="submit" loading={deviceLoading} className="w-full">
                      Confirm New Device
                    </Button>
                  </form>
                </div>
              </>
            )}

            {deviceStep === "done" && (
              <div className="text-center py-4">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
                  <CheckCircle2 className="h-7 w-7 text-green-600" />
                </div>
                <h3 className="font-[family-name:var(--font-heading)] text-lg font-bold">
                  Device Changed Successfully
                </h3>
                <p className="mt-2 text-sm text-brand-gray-500">
                  Your 2FA has been transferred to the new device. All future login codes must be generated using your newly enrolled authenticator app.
                </p>
                <p className="mt-3 text-xs text-amber-600 font-medium">
                  The previous authenticator device has been invalidated.
                </p>
                <Button className="mt-6 w-full" onClick={resetDeviceChange}>
                  Done
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

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
