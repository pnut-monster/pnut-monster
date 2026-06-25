"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  RotateCcw,
  IndianRupee,
  Loader2,
  ChevronLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils/helpers";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  Wallet as WalletType,
  WalletTransaction,
  Campaign,
  Json,
} from "@/lib/supabase/types";
import toast from "react-hot-toast";

const AMOUNT_PRESETS = [100, 200, 500, 1000];

interface TopupBonusConfig {
  slabs?: { min_amount: number; bonus_percent: number }[];
}

function getBonusForAmount(
  amount: number,
  campaign: Campaign | null
): number {
  if (!campaign) return 0;
  const config = campaign.config as TopupBonusConfig;
  if (!config?.slabs || !Array.isArray(config.slabs)) return 0;

  // Sort slabs descending by min_amount so we match the highest qualifying slab
  const sorted = [...config.slabs].sort(
    (a, b) => b.min_amount - a.min_amount
  );
  for (const slab of sorted) {
    if (amount >= slab.min_amount) {
      return Math.round((amount * slab.bonus_percent) / 100);
    }
  }
  return 0;
}

function TransactionIcon({ type }: { type: WalletTransaction["type"] }) {
  switch (type) {
    case "topup":
      return (
        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <ArrowUpRight className="w-4 h-4 text-green-600" />
        </div>
      );
    case "debit":
      return (
        <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
          <ArrowDownRight className="w-4 h-4 text-red-500" />
        </div>
      );
    case "bonus":
      return (
        <div className="w-9 h-9 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
          <Star className="w-4 h-4 text-brand-yellow-dark" />
        </div>
      );
    case "refund":
      return (
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <RotateCcw className="w-4 h-4 text-blue-600" />
        </div>
      );
  }
}

export default function WalletPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [bonusCampaign, setBonusCampaign] = useState<Campaign | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Add money state
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number>(0);
  const [customAmount, setCustomAmount] = useState("");
  const [topUpLoading, setTopUpLoading] = useState(false);

  const activeAmount = selectedAmount || Number(customAmount) || 0;
  const bonusAmount = getBonusForAmount(activeAmount, bonusCampaign);

  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // Fetch wallet
      const { data: walletData } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", user.id)
        .single();
      const w = walletData as WalletType | null;
      setWallet(w);

      // Fetch transactions
      if (w) {
        const { data: txData } = await supabase
          .from("wallet_transactions")
          .select("*")
          .eq("wallet_id", w.id)
          .order("created_at", { ascending: false })
          .limit(50);
        const txs = (txData ?? []) as WalletTransaction[];
        setTransactions(txs);
      }

      // Fetch active wallet_topup_bonus campaign
      const now = new Date().toISOString();
      const { data: campaignData } = await supabase
        .from("campaigns")
        .select("*")
        .eq("type", "wallet_topup_bonus")
        .eq("is_active", true)
        .lte("starts_at", now)
        .gte("ends_at", now)
        .limit(1)
        .single();
      const camp = campaignData as Campaign | null;
      setBonusCampaign(camp);
    } catch (err) {
      console.error("Failed to fetch wallet data:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTopUp = async () => {
    if (!userId || activeAmount < 1) return;
    setTopUpLoading(true);
    try {
      const { data, error } = await supabase.rpc("topup_wallet" as never, {
        p_user_id: userId,
        p_amount: activeAmount,
        p_bonus: bonusAmount,
        p_reference_id: "mock_" + Date.now(),
      } as never);
      const result = data as Json;

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(
        `Added ${formatCurrency(activeAmount)}${
          bonusAmount > 0 ? ` + ${formatCurrency(bonusAmount)} bonus` : ""
        } to wallet!`
      );

      // Reset and refetch
      setShowAddMoney(false);
      setSelectedAmount(0);
      setCustomAmount("");
      setLoading(true);
      await fetchData();
    } catch (err) {
      console.error("Failed to top up wallet:", err);
      toast.error("Failed to add money. Please try again.");
    } finally {
      setTopUpLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const totalBalance =
    (wallet?.loaded_balance ?? 0) + (wallet?.bonus_balance ?? 0);

  return (
    <div className="min-h-screen bg-[#FAFBFC]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-brand-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 rounded-lg hover:bg-brand-gray-100 transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-brand-black" />
          </button>
          <div>
            <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider">WALLET</p>
            <h1 className="text-lg font-bold font-[family-name:var(--font-heading)] text-brand-black">
              My Wallet
            </h1>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-brand-green via-brand-green to-brand-green-dark rounded-2xl p-6 shadow-xl relative overflow-hidden border border-brand-green-dark/20">
          {/* Decorative */}
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full" />
          <div className="absolute -right-4 bottom-0 w-20 h-20 bg-white/5 rounded-full" />

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-5 h-5 text-white/80" />
              <p className="text-xs font-bold text-white/80 uppercase tracking-wider">
                TOTAL BALANCE
              </p>
            </div>
            <p className="font-heading text-4xl font-bold text-white">
              {formatCurrency(totalBalance)}
            </p>

            <div className="flex gap-6 mt-4">
              <div>
                <p className="text-[10px] text-white/70 font-bold uppercase tracking-wider">LOADED</p>
                <p className="text-base font-bold text-white">
                  {formatCurrency(wallet?.loaded_balance ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-white/70 font-bold uppercase tracking-wider">BONUS</p>
                <p className="text-base font-bold text-white">
                  {formatCurrency(wallet?.bonus_balance ?? 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Add Money Button */}
        {!showAddMoney && (
          <button
            onClick={() => setShowAddMoney(true)}
            className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3.5 rounded-xl text-sm hover:bg-brand-yellow-dark hover:shadow-lg transition-all shadow-md"
          >
            <Plus className="w-4 h-4" />
            Add Money
          </button>
        )}

        {/* Add Money Section */}
        {showAddMoney && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-brand-gray-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider">ADD MONEY</p>
                <h3 className="font-heading text-base font-bold text-brand-black">
                  Choose Amount
                </h3>
              </div>
            <button
              onClick={() => {
                setShowAddMoney(false);
                setSelectedAmount(0);
                setCustomAmount("");
              }}
              className="text-xs text-brand-gray-500 font-medium hover:text-brand-gray-700"
            >
              Cancel
            </button>
          </div>

          {/* Amount Presets */}
          <div className="grid grid-cols-4 gap-2">
            {AMOUNT_PRESETS.map((amt) => (
              <button
                key={amt}
                onClick={() => {
                  setSelectedAmount(amt);
                  setCustomAmount("");
                }}
                className={cn(
                  "py-2.5 rounded-xl text-sm font-bold border-2 transition-colors",
                  selectedAmount === amt
                    ? "border-brand-yellow bg-brand-yellow/10 text-brand-black"
                    : "border-brand-gray-200 text-brand-gray-600 hover:border-brand-gray-300"
                )}
              >
                {formatCurrency(amt)}
              </button>
            ))}
          </div>

          {/* Custom Amount */}
          <div>
            <label className="block text-xs font-semibold text-brand-gray-500 mb-1.5">
              Or enter custom amount
            </label>
            <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors">
              <div className="pl-3 pr-2">
                <IndianRupee className="w-4 h-4 text-brand-gray-400" />
              </div>
              <input
                type="number"
                inputMode="numeric"
                placeholder="Enter amount"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  setSelectedAmount(0);
                }}
                className="flex-1 px-2 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400"
                min={1}
              />
            </div>
          </div>

          {/* Bonus Info */}
          {bonusCampaign && activeAmount > 0 && bonusAmount > 0 && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <Star className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm text-green-700">
                You&apos;ll get{" "}
                <span className="font-bold">{formatCurrency(bonusAmount)}</span>{" "}
                bonus!
              </p>
            </div>
          )}

          {/* Confirm Button */}
          <button
            onClick={handleTopUp}
            disabled={activeAmount < 1 || topUpLoading}
            className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3.5 rounded-xl text-sm hover:bg-brand-yellow-dark hover:shadow-lg transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {topUpLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add {activeAmount > 0 ? formatCurrency(activeAmount) : "Money"}
                {bonusAmount > 0 && ` + ${formatCurrency(bonusAmount)} bonus`}
              </>
            )}
          </button>
        </div>
      )}

        {/* Transaction History */}
        <div>
          <div className="mb-3">
            <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider">TRANSACTION HISTORY</p>
            <h3 className="font-heading text-lg font-bold text-brand-black">
              Recent Activity
            </h3>
          </div>

          {transactions.length === 0 ? (
            <EmptyState
              icon={<Wallet className="w-12 h-12" />}
              title="No transactions yet"
              description="Your wallet transactions will appear here after you add money or make a purchase."
            />
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => {
                const isCredit =
                  tx.type === "topup" ||
                  tx.type === "bonus" ||
                  tx.type === "refund";
                return (
                  <div
                    key={tx.id}
                    className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-sm border border-brand-gray-100"
                  >
                    <TransactionIcon type={tx.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-black truncate">
                        {tx.description}
                      </p>
                      <p className="text-xs text-brand-gray-400 mt-0.5">
                        {formatDateTime(tx.created_at)}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "text-sm font-bold shrink-0",
                        isCredit ? "text-green-600" : "text-red-500"
                      )}
                    >
                      {isCredit ? "+" : "-"}
                      {formatCurrency(tx.amount)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
