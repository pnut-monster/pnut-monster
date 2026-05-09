"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getImageUrl } from "@/lib/utils/image";
import { motion } from "framer-motion";
import {
  Search,
  MapPin,
  ChevronRight,
  Wallet,
  Star,
  Target,
  Flame,
  ArrowRight,
  Plus,
  Leaf,
  Gift,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { formatCurrency } from "@/lib/utils/helpers";
import { APP_TAGLINE } from "@/lib/utils/constants";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import type {
  Profile,
  MenuCategory,
  MenuItem,
  Wallet as WalletType,
  LoyaltyAccount,
  LoyaltyTier,
  Mission,
  Campaign,
} from "@/lib/supabase/types";

// ---- Types for mission progress join ----
interface MissionWithProgress extends Mission {
  current_count: number;
}

// ---- Category emoji mapping ----
const CATEGORY_EMOJIS: Record<string, string> = {
  sprouts: "🌱",
  bowls: "🥗",
  drinks: "🥤",
  snacks: "🍿",
  salads: "🥬",
  smoothies: "🫐",
  wraps: "🌯",
  desserts: "🍨",
  combos: "🎉",
  extras: "🧂",
};

function getCategoryEmoji(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJIS)) {
    if (lower.includes(key)) return emoji;
  }
  return "🍽️";
}

// ---- Animation variants ----
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

// ---- Main Page Component ----
export default function CustomerHomePage() {
  const { selectedOutlet } = useOutletStore();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [popularItems, setPopularItems] = useState<MenuItem[]>([]);
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);
  const [loyaltyTier, setLoyaltyTier] = useState<LoyaltyTier | null>(null);
  const [missions, setMissions] = useState<MissionWithProgress[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function loadData() {
      try {
        // Check auth
        const { data } = await supabase.auth.getUser();
        const user = data.user;

        const loggedIn = !!user;
        setIsLoggedIn(loggedIn);

        // Parallel fetches
        const promises: PromiseLike<void>[] = [];

        // 1) Profile
        if (loggedIn && user) {
          promises.push(
            supabase
              .from("profiles")
              .select("*")
              .eq("id", user.id)
              .single()
              .then(({ data }) => {
                const p = data as Profile | null;
                setProfile(p);
              })
          );
        }

        // 2) Categories
        promises.push(
          supabase
            .from("menu_categories")
            .select("*")
            .eq("is_active", true)
            .order("sort_order")
            .then(({ data }) => {
              const cats = data as MenuCategory[] | null;
              setCategories(cats ?? []);
            })
        );

        // 3) Popular / bestseller items
        promises.push(
          supabase
            .from("menu_items")
            .select("*")
            .eq("is_bestseller", true)
            .eq("is_active", true)
            .order("sort_order")
            .limit(10)
            .then(({ data }) => {
              const items = data as MenuItem[] | null;
              setPopularItems(items ?? []);
            })
        );

        // 4) Wallet (logged in)
        if (loggedIn && user) {
          promises.push(
            supabase
              .from("wallets")
              .select("*")
              .eq("user_id", user.id)
              .single()
              .then(({ data }) => {
                const w = data as WalletType | null;
                setWallet(w);
              })
          );
        }

        // 5) Loyalty account + tier (logged in)
        if (loggedIn && user) {
          promises.push(
            supabase
              .from("loyalty_accounts")
              .select("*")
              .eq("user_id", user.id)
              .single()
              .then(async ({ data }) => {
                const acc = data as LoyaltyAccount | null;
                setLoyaltyAccount(acc);
                if (acc?.tier_id) {
                  const { data: tierData } = await supabase
                    .from("loyalty_tiers")
                    .select("*")
                    .eq("id", acc.tier_id)
                    .single();
                  const tier = tierData as LoyaltyTier | null;
                  setLoyaltyTier(tier);
                }
              })
          );
        }

        // 6) Active missions with progress (logged in)
        if (loggedIn && user) {
          promises.push(
            supabase
              .from("missions")
              .select("*")
              .eq("is_active", true)
              .then(async ({ data }) => {
                const allMissions = data as Mission[] | null;
                if (!allMissions?.length) return;

                const now = new Date().toISOString();
                const activeMissions = allMissions.filter(
                  (m) =>
                    m.starts_at <= now && (!m.ends_at || m.ends_at >= now)
                );

                if (!activeMissions.length) return;

                const { data: progressData } = await supabase
                  .from("mission_progress")
                  .select("*")
                  .eq("user_id", user.id)
                  .in(
                    "mission_id",
                    activeMissions.map((m) => m.id)
                  );

                const progressMap = new Map(
                  ((progressData as { mission_id: string; current_count: number; is_completed: boolean }[] | null) ?? []).map(
                    (p) => [p.mission_id, p]
                  )
                );

                const withProgress: MissionWithProgress[] = activeMissions
                  .filter((m) => {
                    const prog = progressMap.get(m.id);
                    return !prog?.is_completed;
                  })
                  .map((m) => ({
                    ...m,
                    current_count: progressMap.get(m.id)?.current_count ?? 0,
                  }));

                setMissions(withProgress.slice(0, 5));
              })
          );
        }

        // 7) Active campaigns
        promises.push(
          supabase
            .from("campaigns")
            .select("*")
            .eq("is_active", true)
            .then(({ data }) => {
              const camps = data as Campaign[] | null;
              if (!camps?.length) {
                setCampaigns([]);
                return;
              }
              const now = new Date().toISOString();
              setCampaigns(
                camps.filter(
                  (c) => c.starts_at <= now && c.ends_at >= now
                )
              );
            })
        );

        await Promise.allSettled(promises);
      } catch {
        // silently handle errors on home page
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const firstName = profile?.full_name?.split(" ")[0];

  // ---- Campaign display helpers ----
  function getCampaignLabel(campaign: Campaign): string {
    switch (campaign.type) {
      case "wallet_topup_bonus":
        return "Wallet Bonus";
      case "referral":
        return "Refer & Earn";
      case "birthday":
        return "Birthday Treat";
      case "first_order":
        return "First Order Deal";
      default:
        return "Special Offer";
    }
  }

  function getCampaignCta(campaign: Campaign): { label: string; href: string } {
    switch (campaign.type) {
      case "wallet_topup_bonus":
        return { label: "Top Up Now", href: "/wallet" };
      case "referral":
        return { label: "Refer Friends", href: "/profile" };
      default:
        return { label: "Learn More", href: "/loyalty" };
    }
  }

  function getTierDisplayName(tier: LoyaltyTier | null): string {
    if (!tier) return "Sprout Star";
    return tier.name
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  // ---- Render ----
  return (
    <motion.div
      className="max-w-lg mx-auto pb-8"
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
    >
      {/* ===== 1. GREETING & OUTLET SELECTOR ===== */}
      <motion.section className="px-4 pt-4 pb-2" variants={fadeUp}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold text-brand-black">
              {loading ? (
                <Skeleton className="h-8 w-40" />
              ) : isLoggedIn && firstName ? (
                `Hey, ${firstName}!`
              ) : (
                "Hey there!"
              )}
            </h1>
            <p className="text-brand-gray-500 text-sm mt-0.5">
              What are you craving today?
            </p>
          </div>
        </div>

        {/* Outlet selector chip */}
        <Link
          href="/outlets"
          className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-white border border-brand-gray-200 shadow-sm hover:shadow-md transition-shadow"
        >
          <MapPin className="w-3.5 h-3.5 text-brand-green" />
          <span className="text-xs font-semibold text-brand-black truncate max-w-[180px]">
            {selectedOutlet ? selectedOutlet.name : "Select Outlet"}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-brand-gray-400" />
        </Link>
      </motion.section>

      {/* ===== 2. HERO BANNER ===== */}
      <motion.section className="px-4 pt-2" variants={fadeUp}>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-yellow via-brand-yellow to-brand-yellow-light p-6">
          {/* Decorative shapes */}
          <div className="absolute -right-8 -bottom-8 w-36 h-36 rounded-full bg-brand-yellow-dark/20" />
          <div className="absolute right-8 -top-6 w-20 h-20 rounded-full bg-white/15" />
          <div className="absolute left-1/2 bottom-2 w-12 h-12 rounded-full bg-brand-yellow-dark/10" />
          {/* Dots pattern */}
          <div className="absolute top-3 right-4 grid grid-cols-3 gap-1.5 opacity-20">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-brand-black"
              />
            ))}
          </div>

          <div className="relative z-10">
            <div className="inline-flex items-center gap-1 bg-brand-black/10 rounded-full px-2.5 py-1 mb-3">
              <Leaf className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                100% Natural
              </span>
            </div>
            <h2 className="font-heading text-2xl font-bold text-brand-black leading-tight">
              Healthy never
              <br />
              tasted this fun!
            </h2>
            <p className="text-brand-black/70 text-sm mt-2 max-w-[200px]">
              Fresh sprouts, power bowls & guilt-free drinks
            </p>
            <Link
              href="/menu"
              className="inline-flex items-center gap-2 mt-4 bg-brand-black text-brand-cream px-5 py-2.5 rounded-full text-sm font-bold hover:bg-brand-gray-800 transition-colors active:scale-[0.97]"
            >
              Order Now
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </motion.section>

      {/* ===== 3. SEARCH BAR ===== */}
      <motion.section className="px-4 pt-5" variants={fadeUp}>
        <Link
          href="/search"
          className="flex items-center gap-3 w-full bg-white rounded-xl px-4 py-3 border border-brand-gray-200 shadow-sm hover:shadow-md transition-shadow"
        >
          <Search className="w-4.5 h-4.5 text-brand-gray-400 shrink-0" />
          <span className="text-sm text-brand-gray-400">
            Search sprouts, bowls, drinks...
          </span>
        </Link>
      </motion.section>

      {/* ===== 4. CATEGORY QUICK LINKS ===== */}
      <motion.section className="pt-6" variants={fadeUp}>
        <div className="flex items-center justify-between px-4 mb-3">
          <h3 className="font-heading text-lg font-bold text-brand-black">
            Categories
          </h3>
          <Link
            href="/menu"
            className="text-xs font-semibold text-brand-yellow-dark flex items-center gap-0.5"
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="w-20 h-24 shrink-0 rounded-2xl" />
            ))}
          </div>
        ) : categories.length > 0 ? (
          <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar pb-1">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/menu?category=${cat.slug}`}
                className="flex flex-col items-center gap-1.5 shrink-0 w-20"
              >
                <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-brand-gray-100 flex items-center justify-center text-2xl hover:shadow-md hover:scale-105 transition-all active:scale-95">
                  {getCategoryEmoji(cat.name)}
                </div>
                <span className="text-xs font-semibold text-brand-gray-700 text-center leading-tight line-clamp-2">
                  {cat.name}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-4 text-sm text-brand-gray-400">
            No categories available yet.
          </p>
        )}
      </motion.section>

      {/* ===== 5. WALLET & LOYALTY SUMMARY ===== */}
      {isLoggedIn && (
        <motion.section className="px-4 pt-6" variants={fadeUp}>
          <div className="grid grid-cols-2 gap-3">
            {/* Wallet Card */}
            <motion.div whileTap={{ scale: 0.97 }}>
              <Link href="/wallet">
                <Card className="relative overflow-hidden bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 p-4">
                  <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-brand-green/10" />
                  <div className="relative z-10">
                    <div className="w-8 h-8 rounded-lg bg-brand-green/15 flex items-center justify-center mb-2">
                      <Wallet className="w-4 h-4 text-brand-green-dark" />
                    </div>
                    <p className="text-[10px] font-semibold text-brand-gray-500 uppercase tracking-wider">
                      Wallet
                    </p>
                    {loading ? (
                      <Skeleton className="h-6 w-16 mt-1" />
                    ) : (
                      <p className="text-lg font-bold text-brand-black mt-0.5">
                        {formatCurrency(
                          (wallet?.loaded_balance ?? 0) +
                            (wallet?.bonus_balance ?? 0)
                        )}
                      </p>
                    )}
                    <span className="text-[10px] font-semibold text-brand-green-dark mt-1 inline-flex items-center gap-0.5">
                      Add Money <ArrowRight className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </Card>
              </Link>
            </motion.div>

            {/* Loyalty Card */}
            <motion.div whileTap={{ scale: 0.97 }}>
              <Link href="/loyalty">
                <Card className="relative overflow-hidden bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-100 p-4">
                  <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-purple-500/10" />
                  <div className="relative z-10">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center mb-2">
                      <Star className="w-4 h-4 text-purple-600" />
                    </div>
                    <p className="text-[10px] font-semibold text-brand-gray-500 uppercase tracking-wider">
                      Loyalty
                    </p>
                    {loading ? (
                      <Skeleton className="h-6 w-16 mt-1" />
                    ) : (
                      <p className="text-lg font-bold text-brand-black mt-0.5">
                        {loyaltyAccount?.current_points ?? 0}
                        <span className="text-xs font-semibold text-brand-gray-500 ml-1">
                          pts
                        </span>
                      </p>
                    )}
                    <span className="text-[10px] font-semibold text-purple-600 mt-1 inline-flex items-center gap-0.5">
                      {getTierDisplayName(loyaltyTier)}{" "}
                      <ArrowRight className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </Card>
              </Link>
            </motion.div>
          </div>
        </motion.section>
      )}

      {/* ===== 6. ACTIVE MISSIONS PREVIEW ===== */}
      {isLoggedIn && !loading && missions.length > 0 && (
        <motion.section className="pt-6" variants={fadeUp}>
          <div className="flex items-center justify-between px-4 mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-4.5 h-4.5 text-brand-orange" />
              <h3 className="font-heading text-lg font-bold text-brand-black">
                Your Missions
              </h3>
            </div>
            <Link
              href="/loyalty"
              className="text-xs font-semibold text-brand-yellow-dark flex items-center gap-0.5"
            >
              See All <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar pb-1">
            {missions.map((mission) => {
              const progress = Math.min(
                mission.current_count / mission.target_count,
                1
              );
              const progressPct = Math.round(progress * 100);

              return (
                <motion.div
                  key={mission.id}
                  whileTap={{ scale: 0.97 }}
                  className="shrink-0 w-56"
                >
                  <Card
                    variant="outlined"
                    className="p-4 h-full"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                        <Flame className="w-4 h-4 text-brand-orange" />
                      </div>
                      <Badge variant="warning">
                        +{mission.reward_points} pts
                      </Badge>
                    </div>
                    <p className="text-sm font-bold text-brand-black leading-snug line-clamp-2">
                      {mission.name}
                    </p>
                    <p className="text-[11px] text-brand-gray-500 mt-1">
                      {mission.current_count}/{mission.target_count}{" "}
                      completed
                    </p>
                    {/* Progress bar */}
                    <div className="mt-2.5 h-2 bg-brand-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-brand-orange to-brand-yellow rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPct}%` }}
                        transition={{
                          duration: 0.8,
                          ease: "easeOut",
                          delay: 0.3,
                        }}
                      />
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* ===== 7. POPULAR ITEMS ===== */}
      <motion.section className="pt-6" variants={fadeUp}>
        <div className="flex items-center justify-between px-4 mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4.5 h-4.5 text-brand-yellow-dark" />
            <h3 className="font-heading text-lg font-bold text-brand-black">
              Popular Items
            </h3>
          </div>
          <Link
            href="/menu"
            className="text-xs font-semibold text-brand-yellow-dark flex items-center gap-0.5"
          >
            View Menu <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shrink-0 w-40">
                <Skeleton className="w-40 h-32 rounded-2xl" />
                <Skeleton className="w-24 h-4 mt-2" />
                <Skeleton className="w-16 h-4 mt-1" />
              </div>
            ))}
          </div>
        ) : popularItems.length > 0 ? (
          <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar pb-1">
            {popularItems.map((item) => (
              <motion.div
                key={item.id}
                whileTap={{ scale: 0.97 }}
                className="shrink-0 w-40"
              >
                <Link href={`/menu?item=${item.slug}`}>
                  <Card variant="default" className="p-0 overflow-hidden">
                    {/* Image placeholder */}
                    <div className="relative w-full h-28 bg-gradient-to-br from-brand-gray-100 to-brand-gray-200 flex items-center justify-center">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getImageUrl(item.image_url) ?? ""}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-3xl opacity-40">🌱</span>
                      )}
                      {/* Bestseller badge */}
                      {item.is_bestseller && (
                        <div className="absolute top-2 left-2">
                          <Badge variant="warning" className="text-[9px] px-1.5 py-0.5">
                            <Flame className="w-2.5 h-2.5 mr-0.5" />
                            Bestseller
                          </Badge>
                        </div>
                      )}
                      {/* Veg indicator */}
                      <div
                        className={`absolute top-2 right-2 w-4 h-4 rounded-sm border-2 flex items-center justify-center ${
                          item.is_veg
                            ? "border-brand-green"
                            : "border-brand-red"
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            item.is_veg
                              ? "bg-brand-green"
                              : "bg-brand-red"
                          }`}
                        />
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-bold text-brand-black leading-snug line-clamp-2 min-h-[2.5rem]">
                        {item.name}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-bold text-brand-black">
                          {formatCurrency(item.base_price)}
                        </span>
                        <button
                          type="button"
                          className="w-7 h-7 rounded-lg bg-brand-yellow flex items-center justify-center hover:bg-brand-yellow-dark transition-colors active:scale-90"
                          aria-label={`Add ${item.name}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // TODO: open customization sheet or add to cart
                          }}
                        >
                          <Plus className="w-4 h-4 text-brand-black" />
                        </button>
                      </div>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="px-4">
            <Card variant="outlined" className="flex flex-col items-center justify-center py-8">
              <Leaf className="w-8 h-8 text-brand-gray-300 mb-2" />
              <p className="text-sm text-brand-gray-400 text-center">
                No popular items yet. Check back soon!
              </p>
            </Card>
          </div>
        )}
      </motion.section>

      {/* ===== 8. ACTIVE CAMPAIGNS BANNER ===== */}
      {!loading && campaigns.length > 0 && (
        <motion.section className="px-4 pt-6" variants={fadeUp}>
          {campaigns.slice(0, 2).map((campaign) => {
            const cta = getCampaignCta(campaign);
            return (
              <motion.div
                key={campaign.id}
                whileTap={{ scale: 0.98 }}
                className="mb-3 last:mb-0"
              >
                <Link href={cta.href}>
                  <Card className="relative overflow-hidden bg-gradient-to-r from-brand-yellow/20 via-brand-yellow/10 to-brand-cream border border-brand-yellow/30 p-4">
                    <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-brand-yellow/15" />
                    <div className="absolute right-6 bottom-1 w-10 h-10 rounded-full bg-brand-yellow/10" />
                    <div className="relative z-10 flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-yellow/30 flex items-center justify-center shrink-0">
                        <Gift className="w-5 h-5 text-brand-yellow-dark" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge variant="warning" className="text-[9px]">
                            {getCampaignLabel(campaign)}
                          </Badge>
                        </div>
                        <p className="text-sm font-bold text-brand-black leading-snug">
                          {campaign.name}
                        </p>
                        <span className="text-xs font-semibold text-brand-yellow-dark mt-1 inline-flex items-center gap-0.5">
                          {cta.label}{" "}
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </motion.section>
      )}

      {/* ===== 9. BOTTOM SPACING ===== */}
      <div className="h-6" />
    </motion.div>
  );
}
