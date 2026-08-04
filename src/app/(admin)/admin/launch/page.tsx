"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Rocket,
  Calendar,
  Mail,
  Download,
  Send,
  ToggleLeft,
  ToggleRight,
  Users,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

interface Subscriber {
  id: string;
  email: string;
  subscribed_at: string;
  notified_at: string | null;
}

export default function AdminLaunchPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [launchDate, setLaunchDate] = useState("");
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      const { data: settings } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["pre_launch_enabled", "pre_launch_date"]);

      if (settings) {
        for (const row of settings) {
          if (row.key === "pre_launch_enabled") setEnabled(row.value === "true");
          if (row.key === "pre_launch_date") {
            const d = new Date(row.value);
            if (!isNaN(d.getTime())) {
              setLaunchDate(toLocalDateTimeString(d));
            }
          }
        }
      }

      const { data: subs, count } = await supabase
        .from("launch_subscribers" as never)
        .select("*", { count: "exact" })
        .order("subscribed_at" as never, { ascending: false })
        .limit(100) as unknown as { data: Subscriber[] | null; count: number | null };

      if (subs) setSubscribers(subs);
      if (count !== null) setSubscriberCount(count);

      setLoading(false);
    };
    load();
  }, []);

  const toLocalDateTimeString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const supabase = createClient();

      const { error: e1 } = await supabase
        .from("app_settings")
        .update({ value: enabled ? "true" : "false", updated_at: new Date().toISOString() } as never)
        .eq("key", "pre_launch_enabled");

      if (e1) throw e1;

      if (launchDate) {
        const isoDate = new Date(launchDate).toISOString();
        const { error: e2 } = await supabase
          .from("app_settings")
          .update({ value: isoDate, updated_at: new Date().toISOString() } as never)
          .eq("key", "pre_launch_date");
        if (e2) throw e2;
      }

      toast.success("Launch settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [enabled, launchDate]);

  const handleEnableOrdering = useCallback(async () => {
    setEnabled(false);
    const supabase = createClient();
    await supabase
      .from("app_settings")
      .update({ value: "false", updated_at: new Date().toISOString() } as never)
      .eq("key", "pre_launch_enabled");
    toast.success("Pre-launch mode disabled. Ordering is now live!");
  }, []);

  const handleSendNotification = useCallback(async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/launch/send-notification", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send notifications");
      } else {
        setSendResult({ sent: data.sent, failed: data.failed });
        toast.success(`Sent ${data.sent} notification${data.sent !== 1 ? "s" : ""}`);
        const supabase = createClient();
        const { data: subs } = await supabase
          .from("launch_subscribers" as never)
          .select("*")
          .order("subscribed_at" as never, { ascending: false })
          .limit(100) as unknown as { data: Subscriber[] | null };
        if (subs) setSubscribers(subs);
      }
    } catch {
      toast.error("Failed to send notifications");
    } finally {
      setSending(false);
    }
  }, []);

  const handleExport = useCallback(() => {
    const csv = ["email,subscribed_at,notified_at"];
    for (const sub of subscribers) {
      csv.push(`${sub.email},${sub.subscribed_at},${sub.notified_at || ""}`);
    }
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `launch-subscribers-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [subscribers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-yellow" />
      </div>
    );
  }

  const pendingCount = subscribers.filter((s) => !s.notified_at).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-brand-yellow/10 rounded-xl">
          <Rocket className="w-6 h-6 text-brand-yellow-dark" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)] text-brand-black">
            Launch Settings
          </h1>
          <p className="text-sm text-brand-gray-500">
            Control pre-launch ordering lock and manage subscribers
          </p>
        </div>
      </div>

      {/* Pre-Launch Mode Toggle */}
      <div className="bg-white rounded-2xl border border-brand-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {enabled ? (
              <ToggleRight className="w-5 h-5 text-brand-yellow-dark" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-brand-gray-400" />
            )}
            <div>
              <h2 className="font-semibold text-brand-black">Pre-Launch Mode</h2>
              <p className="text-sm text-brand-gray-500">
                {enabled
                  ? "Ordering is locked. Customers will see a countdown popup."
                  : "Ordering is live. Customers can place orders normally."}
              </p>
            </div>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              enabled ? "bg-brand-yellow" : "bg-brand-gray-300"
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-6.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Launch Date */}
        <div className="mt-4 pt-4 border-t border-brand-gray-100">
          <label className="flex items-center gap-2 text-sm font-medium text-brand-black mb-2">
            <Calendar className="w-4 h-4 text-brand-gray-500" />
            Launch Date & Time
          </label>
          <input
            type="datetime-local"
            value={launchDate}
            onChange={(e) => setLaunchDate(e.target.value)}
            className="w-full max-w-xs px-3 py-2 rounded-xl border border-brand-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 focus:border-brand-yellow"
          />
          <p className="text-xs text-brand-gray-400 mt-1">
            Ordering will automatically become available after this date/time.
          </p>
        </div>

        {/* Save + Immediate Enable */}
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-brand-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-brand-yellow text-brand-black font-[family-name:var(--font-heading)] font-bold text-sm rounded-xl hover:bg-brand-yellow-dark transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {enabled && (
            <button
              onClick={handleEnableOrdering}
              className="px-5 py-2 bg-brand-green text-white font-[family-name:var(--font-heading)] font-bold text-sm rounded-xl hover:bg-brand-green-dark transition-colors"
            >
              Enable Ordering Now
            </button>
          )}
        </div>
      </div>

      {/* Subscribers */}
      <div className="bg-white rounded-2xl border border-brand-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-brand-gray-500" />
            <div>
              <h2 className="font-semibold text-brand-black">
                Subscribers ({subscriberCount})
              </h2>
              <p className="text-sm text-brand-gray-500">
                {pendingCount} pending notification{pendingCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={subscribers.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-brand-gray-200 rounded-lg hover:bg-brand-gray-50 transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={handleSendNotification}
              disabled={sending || pendingCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand-black text-white rounded-lg hover:bg-brand-gray-800 transition-colors disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Send Launch Email
            </button>
          </div>
        </div>

        {sendResult && (
          <div className="mb-4 p-3 rounded-xl bg-brand-green/10 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-brand-green" />
            <span className="text-sm text-brand-green-dark">
              Sent: {sendResult.sent} | Failed: {sendResult.failed}
            </span>
          </div>
        )}

        {/* Subscriber list */}
        {subscribers.length === 0 ? (
          <div className="text-center py-8 text-brand-gray-400 text-sm">
            <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No subscribers yet
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-brand-gray-100 rounded-xl border border-brand-gray-100">
            {subscribers.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="text-brand-black truncate max-w-[60%]">{sub.email}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-brand-gray-400">
                    {new Date(sub.subscribed_at).toLocaleDateString()}
                  </span>
                  {sub.notified_at ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green">
                      Notified
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-yellow/10 text-brand-yellow-dark">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status indicator */}
      <div className="bg-white rounded-2xl border border-brand-gray-200 p-4">
        <div className="flex items-center gap-3">
          {enabled ? (
            <>
              <AlertCircle className="w-5 h-5 text-brand-orange" />
              <div>
                <p className="text-sm font-medium text-brand-black">Pre-Launch Mode Active</p>
                <p className="text-xs text-brand-gray-500">
                  Customers cannot place orders. They see a countdown popup when trying to order.
                </p>
              </div>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5 text-brand-green" />
              <div>
                <p className="text-sm font-medium text-brand-black">Ordering is Live</p>
                <p className="text-xs text-brand-gray-500">
                  All ordering functionality is available to customers.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
