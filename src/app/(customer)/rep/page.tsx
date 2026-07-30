/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui";
import { Package, CheckCircle2, Clock, IndianRupee } from "lucide-react";

type RepInfo = {
  id: string;
  name: string;
  block_name: string;
  outlet_name: string;
};

type BatchStats = {
  total_assigned: number;
  delivered: number;
  pending: number;
  today_earnings: number;
  total_earnings: number;
};

export default function RepDashboard() {
  const [loading, setLoading] = useState(true);
  const [rep, setRep] = useState<RepInfo | null>(null);
  const [stats, setStats] = useState<BatchStats>({ total_assigned: 0, delivered: 0, pending: 0, today_earnings: 0, total_earnings: 0 });
  const [latestBatchStatus, setLatestBatchStatus] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get rep record
      const { data: repData } = await supabase
        .from("representatives")
        .select("id, name, block_id, outlet_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single();

      if (!repData) { setLoading(false); return; }

      // Get block and outlet names
      const [blockRes, outletRes] = await Promise.all([
        supabase.from("delivery_blocks").select("name").eq("id", repData.block_id).single(),
        supabase.from("outlets").select("name").eq("id", repData.outlet_id).single(),
      ]);

      setRep({
        id: repData.id,
        name: repData.name,
        block_name: (blockRes.data as { name: string } | null)?.name || "—",
        outlet_name: (outletRes.data as { name: string } | null)?.name || "—",
      });

      // Get current batch stats (latest processing/open window for this outlet)
      const { data: latestWindow } = await supabase
        .from("batch_windows")
        .select("id, status")
        .eq("outlet_id", repData.outlet_id)
        .in("status", ["processing", "closed", "open"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestWindow) {
        setLatestBatchStatus(latestWindow.status);

        const { data: orders } = await supabase
          .from("batch_orders")
          .select("delivery_status")
          .eq("batch_window_id", latestWindow.id)
          .eq("rep_id", repData.id);

        if (orders) {
          const delivered = orders.filter(o => o.delivery_status === "delivered").length;
          const pending = orders.filter(o => o.delivery_status !== "delivered" && o.delivery_status !== "undeliverable").length;
          setStats(s => ({ ...s, total_assigned: orders.length, delivered, pending }));
        }
      }

      // Get earnings
      const { data: ledger } = await supabase
        .from("rep_commission_ledger")
        .select("amount_earned, created_at")
        .eq("rep_id", repData.id);

      if (ledger) {
        const total = ledger.reduce((sum, l) => sum + Number(l.amount_earned), 0);
        const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const todayEarnings = ledger
          .filter(l => new Date(l.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === todayIST)
          .reduce((sum, l) => sum + Number(l.amount_earned), 0);
        setStats(s => ({ ...s, total_earnings: total, today_earnings: todayEarnings }));
      }

      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  if (!rep) return <div className="text-center py-20 text-gray-500">No active representative record found.</div>;

  return (
    <div className="space-y-6">
      {/* Info card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-lg font-bold text-gray-900">{rep.name}</p>
        <p className="text-sm text-gray-500">{rep.block_name} · {rep.outlet_name}</p>
      </div>

      {/* Batch status */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Current Batch</p>
        {latestBatchStatus ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="flex items-center justify-center w-10 h-10 mx-auto rounded-full bg-blue-50 mb-1">
                <Package size={18} className="text-blue-600" />
              </div>
              <p className="text-lg font-bold text-gray-900">{stats.total_assigned}</p>
              <p className="text-[10px] text-gray-500">Assigned</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center w-10 h-10 mx-auto rounded-full bg-green-50 mb-1">
                <CheckCircle2 size={18} className="text-green-600" />
              </div>
              <p className="text-lg font-bold text-gray-900">{stats.delivered}</p>
              <p className="text-[10px] text-gray-500">Delivered</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center w-10 h-10 mx-auto rounded-full bg-orange-50 mb-1">
                <Clock size={18} className="text-orange-600" />
              </div>
              <p className="text-lg font-bold text-gray-900">{stats.pending}</p>
              <p className="text-[10px] text-gray-500">Pending</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center">No active batch</p>
        )}
      </div>

      {/* Earnings */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Earnings</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-green-50 rounded-xl">
            <IndianRupee size={16} className="mx-auto text-green-600 mb-1" />
            <p className="text-lg font-bold text-green-700">₹{stats.today_earnings}</p>
            <p className="text-[10px] text-green-600">Today</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <IndianRupee size={16} className="mx-auto text-gray-600 mb-1" />
            <p className="text-lg font-bold text-gray-700">₹{stats.total_earnings}</p>
            <p className="text-[10px] text-gray-500">Lifetime</p>
          </div>
        </div>
      </div>
    </div>
  );
}
