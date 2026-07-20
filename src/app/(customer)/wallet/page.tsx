"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  RotateCcw,
  Loader2,
  ChevronLeft,
  Gift,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils/helpers";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  Wallet as WalletType,
  WalletTransaction,
} from "@/lib/supabase/types";
import toast from "react-hot-toast";

const TOPUP_PRESETS = [100, 200, 500, 1000];

type WalletSummary = Pick<
  WalletType,
  "id" | "user_id" | "loaded_balance" | "bonus_balance"
>;
type WalletTransactionSummary = Pick<
  WalletTransaction,
  "id" | "wallet_id" | "type" | "amount" | "description" | "created_at"
>;
type WalletCacheEntry = {
  wallet: WalletSummary | null;
  transactions: WalletTransactionSummary[];
};

const walletPageCache = new Map<string, WalletCacheEntry>();

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
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransactionSummary[]>([]);

  // Top-up state
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupLoading, setTopupLoading] = useState(false);

  // Gift card redeem state
  const [showGiftCard, setShowGiftCard] = useState(false);
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardLoading, setGiftCardLoading] = useState(false);

  // Transaction pagination
  const [txPage, setTxPage] = useState(0);
  const TX_PAGE_SIZE = 10;

  const loadRazorpayScript = () =>
    new Promise<void>((resolve, reject) => {
      if (window.Razorpay) {
        resolve();
        return;
      }

      const existingScript = document.getElementById("razorpay-script") as
        | HTMLScriptElement
        | null;
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Could not load payment gateway")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = "razorpay-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load payment gateway"));
      document.body.appendChild(script);
    });

  const fetchData = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const cached = walletPageCache.get(user.id);
      if (cached) {
        setWallet(cached.wallet);
        setTransactions(cached.transactions);
        setLoading(false);
      }

      const { data: walletData } = await supabase
        .from("wallets")
        .select("id, user_id, loaded_balance, bonus_balance")
        .eq("user_id", user.id)
        .single();
      const w = walletData as WalletSummary | null;
      setWallet(w);

      let txs: WalletTransactionSummary[] = [];
      if (w) {
        const { data: txData } = await supabase
          .from("wallet_transactions")
          .select("id, wallet_id, type, amount, description, created_at")
          .eq("wallet_id", w.id)
          .order("created_at", { ascending: false })
          .limit(50);
        txs = (txData ?? []) as WalletTransactionSummary[];
        setTransactions(txs);
      } else {
        setTransactions([]);
      }

      walletPageCache.set(user.id, { wallet: w, transactions: txs });
    } catch (err) {
      console.error("Failed to fetch wallet data:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTopup = async () => {
    const amount = parseFloat(topupAmount);
    if (!amount || amount < 1) {
      toast.error("Enter a valid amount (minimum ₹1)");
      return;
    }

    setTopupLoading(true);
    try {
      await loadRazorpayScript();

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please login to continue");
        return;
      }

      // Create Razorpay order
      const res = await fetch("/api/razorpay/wallet-topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-order",
          amount,
          accessToken: session.access_token,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to create payment");
        setTopupLoading(false);
        return;
      }

      const order = await res.json();

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
        amount: order.amount,
        currency: order.currency,
        name: "PNUT Monster",
        description: "Wallet Top-up",
        order_id: order.id,
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            const verifyRes = await fetch("/api/razorpay/wallet-topup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "verify",
                amount,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                accessToken: session.access_token,
              }),
            });

            if (!verifyRes.ok) {
              const err = await verifyRes.json();
              toast.error(err.error || "Payment verification failed");
              setTopupLoading(false);
              return;
            }

            toast.success(`${formatCurrency(amount)} added to wallet!`);
            setShowTopup(false);
            setTopupAmount("");
            setTopupLoading(false);
            setLoading(true);
            await fetchData();
          } catch {
            toast.error("Payment verification failed");
            setTopupLoading(false);
          }
        },
        prefill: {
          email: session.user?.email || "",
        },
        theme: { color: "#4CAF50" },
        modal: {
          ondismiss: () => {
            setTopupLoading(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response: { error: { description: string } }) => {
        toast.error(response.error.description || "Payment failed");
        setTopupLoading(false);
      });
      rzp.open();
    } catch {
      toast.error("Something went wrong");
      setTopupLoading(false);
    }
  };

  const handleRedeemGiftCard = async () => {
    const code = giftCardCode.trim();
    if (!code) { toast.error("Enter a gift card code"); return; }
    setGiftCardLoading(true);
    try {
      const { data, error } = await supabase.rpc("redeem_gift_card" as never, { p_redeem_code: code } as never);
      if (error) { toast.error(error.message); return; }
      const result = data as { success: boolean; error?: string; wallet_credit?: number; gift_card_id?: string };
      if (!result.success) { toast.error(result.error ?? "Redemption failed"); return; }
      toast.success(`Gift card redeemed! ${formatCurrency(result.wallet_credit ?? 0)} added to wallet.`);
      setShowGiftCard(false);
      setGiftCardCode("");
      setLoading(true);
      await fetchData();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setGiftCardLoading(false);
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
        {!showTopup && (
          <button
            onClick={() => setShowTopup(true)}
            className="w-full flex items-center justify-center gap-2 bg-brand-green text-white font-bold py-3.5 rounded-xl text-sm hover:bg-brand-green-dark transition-all shadow-md"
          >
            <Plus className="w-4 h-4" />
            Add Money to Wallet
          </button>
        )}

        {/* Top-up Form */}
        {showTopup && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-brand-green/20 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-brand-green uppercase tracking-wider">TOP UP</p>
                <h3 className="font-heading text-base font-bold text-brand-black">
                  Add Money
                </h3>
              </div>
              <button
                onClick={() => { setShowTopup(false); setTopupAmount(""); }}
                className="text-xs text-brand-gray-500 font-medium hover:text-brand-gray-700"
              >
                Cancel
              </button>
            </div>

            {/* Preset amounts */}
            <div className="grid grid-cols-4 gap-2">
              {TOPUP_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setTopupAmount(String(preset))}
                  className={cn(
                    "py-2.5 rounded-xl text-sm font-bold border-2 transition-all",
                    topupAmount === String(preset)
                      ? "border-brand-green bg-brand-green/10 text-brand-green-dark"
                      : "border-brand-gray-200 text-brand-gray-600 hover:border-brand-green/50"
                  )}
                >
                  ₹{preset}
                </button>
              ))}
            </div>

            {/* Custom amount */}
            <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-green transition-colors">
              <div className="pl-4 pr-1 text-lg font-bold text-brand-gray-400">₹</div>
              <input
                type="number"
                placeholder="Enter amount"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                className="flex-1 px-2 py-3 text-lg font-bold bg-transparent outline-none placeholder:text-brand-gray-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                min="1"
              />
            </div>

            <button
              onClick={handleTopup}
              disabled={topupLoading || !topupAmount || parseFloat(topupAmount) < 1}
              className="w-full flex items-center justify-center gap-2 bg-brand-green text-white font-bold py-3.5 rounded-xl text-sm hover:bg-brand-green-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {topupLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Pay {topupAmount ? formatCurrency(parseFloat(topupAmount) || 0) : ""}
                </>
              )}
            </button>
          </div>
        )}

        {/* Gift Card Redeem */}
        {!showGiftCard && !showTopup && (
          <button
            onClick={() => setShowGiftCard(true)}
            className="w-full flex items-center justify-center gap-2 bg-white text-purple-700 font-bold py-3.5 rounded-xl text-sm border-2 border-purple-200 hover:border-purple-400 hover:bg-purple-50 transition-all"
          >
            <Gift className="w-4 h-4" />
            Redeem Gift Card
          </button>
        )}

        {showGiftCard && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-purple-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">GIFT CARD</p>
                <h3 className="font-heading text-base font-bold text-brand-black">
                  Enter Redeem Code
                </h3>
              </div>
              <button
                onClick={() => { setShowGiftCard(false); setGiftCardCode(""); }}
                className="text-xs text-brand-gray-500 font-medium hover:text-brand-gray-700"
              >
                Cancel
              </button>
            </div>

            <div className="flex items-center border-2 border-purple-200 rounded-xl focus-within:border-purple-400 transition-colors">
              <div className="pl-3 pr-2">
                <Gift className="w-4 h-4 text-purple-400" />
              </div>
              <input
                type="text"
                placeholder="Enter gift card code"
                value={giftCardCode}
                onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
                className="flex-1 px-2 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400 font-mono tracking-wider"
                maxLength={20}
              />
            </div>

            <button
              onClick={handleRedeemGiftCard}
              disabled={!giftCardCode.trim() || giftCardLoading}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white font-bold py-3.5 rounded-xl text-sm hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {giftCardLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Gift className="w-4 h-4" />
                  Redeem
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
            <>
              <div className="space-y-2">
                {transactions.slice(txPage * TX_PAGE_SIZE, (txPage + 1) * TX_PAGE_SIZE).map((tx) => {
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

              {transactions.length > TX_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-3">
                  <p className="text-xs text-brand-gray-400">
                    {txPage * TX_PAGE_SIZE + 1}–{Math.min((txPage + 1) * TX_PAGE_SIZE, transactions.length)} of {transactions.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTxPage(p => Math.max(0, p - 1))}
                      disabled={txPage === 0}
                      className="px-3 py-1.5 text-xs font-medium border border-brand-gray-200 rounded-lg disabled:opacity-40 hover:bg-brand-gray-50 transition-colors"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setTxPage(p => Math.min(Math.ceil(transactions.length / TX_PAGE_SIZE) - 1, p + 1))}
                      disabled={(txPage + 1) * TX_PAGE_SIZE >= transactions.length}
                      className="px-3 py-1.5 text-xs font-medium border border-brand-gray-200 rounded-lg disabled:opacity-40 hover:bg-brand-gray-50 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
