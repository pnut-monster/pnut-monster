"use client";

import { useState } from "react";
import { APP_NAME, TAX_RATE, PACKAGING_CHARGE } from "@/lib/utils/constants";
import { Input, Button } from "@/components/ui";
import {
  Settings,
  Percent,
  Package,
  Info,
  Save,
} from "lucide-react";

export default function AdminSettingsPage() {
  const [taxRate, setTaxRate] = useState(String(TAX_RATE * 100));
  const [packagingCharge, setPackagingCharge] = useState(
    String(PACKAGING_CHARGE)
  );
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // Placeholder: In the future this would write to a settings table in Supabase
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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

        <div className="flex items-center gap-3 mt-6">
          <Button size="sm" onClick={handleSave}>
            <Save className="w-4 h-4" />
            {saved ? "Saved!" : "Save Changes"}
          </Button>
          {saved && (
            <span className="text-sm text-brand-green font-semibold">
              Settings saved (local only for now)
            </span>
          )}
        </div>

        <p className="text-xs text-brand-gray-400 mt-3">
          These values are currently sourced from app constants. DB-backed
          settings will be implemented in a future update.
        </p>
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
