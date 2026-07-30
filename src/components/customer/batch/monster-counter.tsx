// @ts-nocheck — batch tables not yet in generated types; remove after running migrations + type gen
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Clock, Zap, Users } from "lucide-react";

type BatchWindowInfo = {
  window_id: string;
  outlet_id: string;
  status: string;
  start_time: string;
  end_time: string;
  max_orders: number;
  confirmed_count: number;
  held_count: number;
  available: number;
  delivery_fee: number;
  counter_display_mode: string;
  counter_visual_style: string;
};

type OutletInfo = { id: string; name: string; slug: string };

function getUrgencyText(available: number, max: number): string {
  const filled = (max - available) / max;
  if (available <= 0) return "Sold out! Come back tomorrow.";
  if (filled >= 0.85) return "Last few spots!";
  if (filled >= 0.6) return "Almost full — hurry!";
  if (filled >= 0.3) return "Filling up!";
  return "Window open — order now!";
}

function getMonsterColor(available: number, max: number): string {
  const filled = (max - available) / max;
  if (filled >= 0.85) return "from-red-500 to-red-600";
  if (filled >= 0.6) return "from-orange-400 to-orange-500";
  if (filled >= 0.3) return "from-yellow-400 to-yellow-500";
  return "from-green-400 to-green-500";
}

function formatTimeRemaining(endTime: string): string {
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return "Closing soon";
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m left`;
  return `${mins}m left`;
}

export function MonsterCounter() {
  const [windows, setWindows] = useState<(BatchWindowInfo & { outlet_name: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextWindow, setNextWindow] = useState<{ outlet_name: string; start_time: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      try {
      // Get open batch windows
      const { data: openWindows } = await (supabase
        .from("batch_windows" as never)
        .select("id, outlet_id, status, start_time, end_time, max_orders, current_order_count, delivery_fee, counter_display_mode, counter_visual_style")
        .in("status", ["open", "scheduled"])
        .order("start_time") as unknown as Promise<{ data: { id: string; outlet_id: string; status: string; start_time: string; end_time: string; max_orders: number; current_order_count: number; delivery_fee: number; counter_display_mode: string; counter_visual_style: string }[] | null }>);

      if (!openWindows || openWindows.length === 0) {
        // Check for next scheduled window
        const { data: scheduled } = await (supabase
          .from("batch_windows" as never)
          .select("outlet_id, start_time")
          .eq("status", "scheduled")
          .gt("start_time", new Date().toISOString())
          .order("start_time")
          .limit(1) as unknown as Promise<{ data: { outlet_id: string; start_time: string }[] | null }>);

        if (scheduled && scheduled.length > 0) {
          const { data: outlet } = await supabase
            .from("outlets")
            .select("name")
            .eq("id", scheduled[0].outlet_id)
            .single();
          setNextWindow({
            outlet_name: (outlet as { name: string } | null)?.name || "Unknown",
            start_time: scheduled[0].start_time,
          });
        }
        setLoading(false);
        return;
      }

      // Try lazy-open scheduled windows that should be open now
      for (const win of openWindows) {
        if (win.status === "scheduled" && new Date(win.start_time) <= new Date()) {
          await supabase.rpc("maybe_open_batch_window" as never, { p_window_id: win.id } as never);
        }
      }

      // Get availability for open windows
      const results: (BatchWindowInfo & { outlet_name: string })[] = [];
      for (const win of openWindows.filter(w => w.status === "open" || (w.status === "scheduled" && new Date(w.start_time) <= new Date()))) {
        const { data: availability } = await supabase.rpc("get_batch_window_availability" as never, { p_window_id: win.id } as never);
        if (availability && (availability as BatchWindowInfo).status === "open") {
          const { data: outlet } = await supabase
            .from("outlets")
            .select("name")
            .eq("id", win.outlet_id)
            .single();
          results.push({
            ...(availability as BatchWindowInfo),
            outlet_name: (outlet as { name: string } | null)?.name || "Unknown",
          });
        }
      }

      setWindows(results);

      // Check next scheduled if no open windows
      if (results.length === 0) {
        const nextScheduled = openWindows.find(w => w.status === "scheduled" && new Date(w.start_time) > new Date());
        if (nextScheduled) {
          const { data: outlet } = await supabase
            .from("outlets")
            .select("name")
            .eq("id", nextScheduled.outlet_id)
            .single();
          setNextWindow({
            outlet_name: (outlet as { name: string } | null)?.name || "Unknown",
            start_time: nextScheduled.start_time,
          });
        }
      }

      setLoading(false);
      } catch {
        setLoading(false);
      }
    }

    load();

    // Subscribe to realtime updates on batch_windows for counter changes
    const channel = supabase
      .channel("batch-window-counter")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "batch_windows",
      }, () => { load(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) return null;

  // No active or scheduled windows
  if (windows.length === 0 && !nextWindow) return null;

  // Show next scheduled window
  if (windows.length === 0 && nextWindow) {
    return (
      <div className="mx-4 rounded-2xl bg-gray-50 border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
            <Clock size={20} className="text-gray-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">Next batch: {nextWindow.outlet_name}</p>
            <p className="text-xs text-gray-500">
              {new Date(nextWindow.start_time).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show active window counters
  return (
    <div className="space-y-3 mx-4">
      {windows.map(win => (
        <Link key={win.window_id} href="/menu"
          className="block rounded-2xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <div className={`bg-gradient-to-r ${getMonsterColor(win.available, win.max_orders)} p-4 text-white`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium opacity-90">{win.outlet_name}</p>
                <p className="text-lg font-bold mt-0.5">
                  {win.counter_display_mode === "exact"
                    ? win.available <= 0
                      ? "Sold out! Come back tomorrow."
                      : win.available <= 3
                        ? `Last ${win.available} spot${win.available > 1 ? "s" : ""}!`
                        : `${win.available} slots left — order now!`
                    : getUrgencyText(win.available, win.max_orders)
                  }
                </p>
              </div>
              <div className="text-right">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  <Zap size={24} className="text-white" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs opacity-90">
              <span className="flex items-center gap-1">
                <Clock size={12} /> {formatTimeRemaining(win.end_time)}
              </span>
              <span className="flex items-center gap-1">
                <Users size={12} /> {win.confirmed_count}/{win.max_orders} orders
              </span>
              {win.delivery_fee === 0 && (
                <span className="bg-white/20 px-2 py-0.5 rounded-full font-medium">FREE delivery</span>
              )}
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1 bg-gray-100">
            <div className="h-full bg-brand-green transition-all duration-500"
              style={{ width: `${Math.min(100, ((win.max_orders - win.available) / win.max_orders) * 100)}%` }} />
          </div>
        </Link>
      ))}
    </div>
  );
}
