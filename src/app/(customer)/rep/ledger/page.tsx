// @ts-nocheck — batch tables not yet in generated types; remove after running migrations + type gen
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui";
import { IndianRupee, Calendar } from "lucide-react";

type LedgerEntry = {
  id: string;
  batch_window_id: string;
  orders_delivered: number;
  amount_earned: number;
  settled: boolean;
  created_at: string;
  window_date?: string;
};

export default function RepLedgerPage() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalSettled, setTotalSettled] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rep } = await supabase
        .from("representatives")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!rep) { setLoading(false); return; }

      const { data: ledger } = await supabase
        .from("rep_commission_ledger")
        .select("*")
        .eq("rep_id", rep.id)
        .order("created_at", { ascending: false });

      if (ledger) {
        // Get window dates
        const windowIds = [...new Set(ledger.map(l => l.batch_window_id))];
        const { data: windows } = await supabase
          .from("batch_windows")
          .select("id, start_time")
          .in("id", windowIds);

        const enriched: LedgerEntry[] = ledger.map(l => ({
          ...l,
          window_date: windows?.find(w => w.id === l.batch_window_id)?.start_time || l.created_at,
        }));

        setEntries(enriched);
        setTotalEarned(ledger.reduce((s, l) => s + Number(l.amount_earned), 0));
        setTotalSettled(ledger.filter(l => l.settled).reduce((s, l) => s + Number(l.amount_earned), 0));
      }

      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-gray-900">Earnings Ledger</h1>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <IndianRupee size={16} className="mx-auto text-green-600 mb-1" />
          <p className="text-xl font-bold text-gray-900">₹{totalEarned.toFixed(0)}</p>
          <p className="text-[10px] text-gray-500">Total Earned</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <IndianRupee size={16} className="mx-auto text-blue-600 mb-1" />
          <p className="text-xl font-bold text-gray-900">₹{totalSettled.toFixed(0)}</p>
          <p className="text-[10px] text-gray-500">Settled</p>
        </div>
      </div>

      {/* Pending */}
      {totalEarned > totalSettled && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
          <p className="text-sm font-medium text-yellow-800">
            ₹{(totalEarned - totalSettled).toFixed(0)} pending settlement
          </p>
        </div>
      )}

      {/* Entries */}
      {entries.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-8">No earnings yet</p>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => (
            <div key={entry.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Calendar size={12} className="text-gray-400" />
                  <span className="text-xs text-gray-500">
                    {new Date(entry.window_date || entry.created_at).toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-0.5">{entry.orders_delivered} orders delivered</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-900">₹{Number(entry.amount_earned).toFixed(0)}</p>
                <span className={`text-[10px] ${entry.settled ? "text-green-600" : "text-yellow-600"}`}>
                  {entry.settled ? "Settled" : "Pending"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
