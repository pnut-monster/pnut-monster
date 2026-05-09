"use client";

import { useState, useEffect } from "react";
import {
  MapPin,
  Clock,
  ShoppingBag,
  Bell,
  Save,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Outlet } from "@/lib/supabase/types";

interface OutletSettings {
  autoAccept: boolean;
  estimatedPrepTime: number; // minutes
  maxConcurrentOrders: number;
  soundNotifications: boolean;
}

const DEFAULT_SETTINGS: OutletSettings = {
  autoAccept: false,
  estimatedPrepTime: 20,
  maxConcurrentOrders: 15,
  soundNotifications: true,
};

export default function RestaurantSettingsPage() {
  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [settings, setSettings] = useState<OutletSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadOutletAndSettings();
  }, []);

  async function loadOutletAndSettings() {
    const supabase = createClient();
    const outletId = localStorage.getItem("pnut_selected_outlet");

    // Load saved settings from localStorage
    const savedSettings = localStorage.getItem("pnut_outlet_settings");
    if (savedSettings) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
      } catch {
        // Ignore parse errors
      }
    }

    // Also sync autoAccept and sound from their individual keys
    const autoAccept = localStorage.getItem("pnut_auto_accept");
    const sound = localStorage.getItem("pnut_order_sound");
    if (autoAccept !== null) {
      setSettings((prev) => ({ ...prev, autoAccept: autoAccept === "true" }));
    }
    if (sound !== null) {
      setSettings((prev) => ({ ...prev, soundNotifications: sound !== "false" }));
    }

    try {
      if (!outletId) throw new Error("No outlet selected");

      const { data, error } = await supabase
        .from("outlets")
        .select("*")
        .eq("id", outletId)
        .single();

      if (error) throw error;
      setOutlet(data as Outlet);
      setLoading(false);
      return;
    } catch (err) {
      console.error("Failed to fetch outlet settings:", err);
      setLoading(false);
    }
  }

  function handleSave() {
    // Persist to localStorage
    localStorage.setItem("pnut_outlet_settings", JSON.stringify(settings));
    localStorage.setItem("pnut_auto_accept", String(settings.autoAccept));
    localStorage.setItem("pnut_order_sound", String(settings.soundNotifications));

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl h-40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Outlet Info (read-only) */}
      <section className="bg-white rounded-2xl border border-brand-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-brand-green" />
          <h2 className="font-heading text-lg font-bold text-brand-black">
            Outlet Information
          </h2>
        </div>

        <div className="space-y-3">
          <InfoRow label="Name" value={outlet?.name ?? "—"} />
          <InfoRow label="Address" value={outlet?.address ?? "—"} />
          <InfoRow
            label="City"
            value={`${outlet?.city ?? "—"}, ${outlet?.state ?? "—"} ${outlet?.pincode ?? ""}`}
          />
          <InfoRow label="Phone" value={outlet?.phone ?? "—"} />
        </div>

        <p className="text-xs text-brand-gray-400 mt-3 italic">
          Outlet details are managed by admin. Contact support to update.
        </p>
      </section>

      {/* Operating Hours (read-only) */}
      <section className="bg-white rounded-2xl border border-brand-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-brand-green" />
          <h2 className="font-heading text-lg font-bold text-brand-black">
            Operating Hours
          </h2>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex-1">
            <p className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wider mb-1">
              Opens At
            </p>
            <p className="text-2xl font-heading font-bold text-brand-black">
              {outlet?.opens_at ?? "09:00"}
            </p>
          </div>
          <div className="w-8 h-px bg-brand-gray-300" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wider mb-1">
              Closes At
            </p>
            <p className="text-2xl font-heading font-bold text-brand-black">
              {outlet?.closes_at ?? "22:00"}
            </p>
          </div>
        </div>

        <p className="text-xs text-brand-gray-400 mt-3 italic">
          Operating hours are managed by admin.
        </p>
      </section>

      {/* Order Settings */}
      <section className="bg-white rounded-2xl border border-brand-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingBag className="w-5 h-5 text-brand-green" />
          <h2 className="font-heading text-lg font-bold text-brand-black">
            Order Settings
          </h2>
        </div>

        <div className="space-y-5">
          {/* Auto-accept toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-brand-gray-700">
                Auto-Accept Orders
              </p>
              <p className="text-xs text-brand-gray-500 mt-0.5">
                New orders are automatically accepted
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  autoAccept: !prev.autoAccept,
                }))
              }
              className={`relative w-12 h-7 rounded-full transition-colors ${
                settings.autoAccept ? "bg-brand-green" : "bg-brand-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform ${
                  settings.autoAccept ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Estimated prep time slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-brand-gray-700">
                Estimated Prep Time
              </p>
              <span className="text-sm font-bold text-brand-green">
                {settings.estimatedPrepTime} min
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={60}
              step={5}
              value={settings.estimatedPrepTime}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  estimatedPrepTime: parseInt(e.target.value),
                }))
              }
              className="w-full h-2 bg-brand-gray-200 rounded-full appearance-none cursor-pointer accent-brand-green"
            />
            <div className="flex justify-between text-xs text-brand-gray-400 mt-1">
              <span>10 min</span>
              <span>60 min</span>
            </div>
          </div>

          {/* Max concurrent orders */}
          <div>
            <p className="text-sm font-semibold text-brand-gray-700 mb-2">
              Max Concurrent Orders
            </p>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.maxConcurrentOrders}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val > 0) {
                  setSettings((prev) => ({
                    ...prev,
                    maxConcurrentOrders: val,
                  }));
                }
              }}
              className="w-32 px-4 py-2.5 rounded-xl border border-brand-gray-300 text-sm text-brand-black focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green transition-colors"
            />
            <p className="text-xs text-brand-gray-400 mt-1">
              New orders will be paused when this limit is reached
            </p>
          </div>
        </div>
      </section>

      {/* Notification Settings */}
      <section className="bg-white rounded-2xl border border-brand-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-brand-green" />
          <h2 className="font-heading text-lg font-bold text-brand-black">
            Notifications
          </h2>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-brand-gray-700">
              New Order Sound Alert
            </p>
            <p className="text-xs text-brand-gray-500 mt-0.5">
              Play a sound when a new order arrives
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                soundNotifications: !prev.soundNotifications,
              }))
            }
            className={`relative w-12 h-7 rounded-full transition-colors ${
              settings.soundNotifications ? "bg-brand-green" : "bg-brand-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform ${
                settings.soundNotifications ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </section>

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors ${
          saved
            ? "bg-brand-green text-white"
            : "bg-brand-green text-white hover:bg-brand-green-dark"
        }`}
      >
        {saved ? (
          <>
            <CheckCircle2 className="w-5 h-5" />
            Settings Saved
          </>
        ) : (
          <>
            <Save className="w-5 h-5" />
            Save Settings
          </>
        )}
      </button>
    </div>
  );
}

// ─── Info Row ───────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <p className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wider sm:w-20 shrink-0">
        {label}
      </p>
      <p className="text-sm text-brand-gray-700">{value}</p>
    </div>
  );
}
