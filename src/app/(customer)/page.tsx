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
  Flame,
  ArrowRight,
  Plus,
  Sparkles,
  TrendingUp,
  Gift,
  Info,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { formatCurrency } from "@/lib/utils/helpers";
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

interface MissionWithProgress extends Mission {
  current_count: number;
}

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

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

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
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        const loggedIn = !!user;
        setIsLoggedIn(loggedIn);

        const promises: PromiseLike<void>[] = [];

        if (loggedIn && user) {
          promises.push(
            supabase.from("profiles").select("*").eq("id", user.id).single()
              .then(({ data }) => setProfile(data as Profile | null))
          );
        }

        promises.push(
          supabase.from("menu_categories").select("*").eq("is_active", true).order("sort_order")
            .then(({ data }) => setCategories(data as MenuCategory[] ?? []))
        );

        promises.push(
          supabase.from("menu_items").select("*").eq("is_bestseller", true).eq("is_active", true).order("sort_order").limit(10)
            .then(({ data }) => setPopularItems(data as MenuItem[] ?? []))
        );

        if (loggedIn && user) {
          promises.push(
            supabase.from("wallets").select("*").eq("user_id", user.id).single()
              .then(({ data }) => setWallet(data as WalletType | null))
          );

          promises.push(
            supabase.from("loyalty_accounts").select("*").eq("user_id", user.id).single()
              .then(async ({ data }) => {
                const acc = data as LoyaltyAccount | null;
                setLoyaltyAccount(acc);
                if (acc?.tier_id) {
                  const { data: tierData } = await supabase.from("loyalty_tiers").select("*").eq("id", acc.tier_id).single();
                  setLoyaltyTier(tierData as LoyaltyTier | null);
                }
              })
          );

          promises.push(
            supabase.from("campaigns").select("*").eq("is_active", true)
              .then(({ data }) => {
                const camps = data as Campaign[] | null;
                if (!camps?.length) { setCampaigns([]); return; }
                const now = new Date().toISOString();
                setCampaigns(camps.filter(c => c.starts_at <= now && c.ends_at >= now));
              })
          );
        }

        await Promise.allSettled(promises);
      } catch {
        // Handle errors silently
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const firstName = profile?.full_name?.split(" ")[0];

  function getTierDisplayName(tier: LoyaltyTier | null): string {
    if (!tier) return "Sprout Star";
    return tier.name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  return (
    <div className="pb-8">
      <motion.div
        className="max-w-7xl mx-auto px-4 lg:px-8"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        {/* Header Section */}
        <motion.section className="pt-6 pb-8" variants={fadeUp}>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            {/* Greeting */}
            <div className="flex-1 min-w-[300px]">
              <h1 className="font-heading text-3xl lg:text-4xl font-bold text-brand-black mb-2">
                {loading ? (
                  <Skeleton className="h-10 w-48" />
                ) : isLoggedIn && firstName ? (
                  <>Hey, <span className="text-brand-yellow">{firstName}!</span> 👋</>
                ) : (
                  <>Welcome! 👋</>
                )}
              </h1>
              <p className="text-brand-gray-600 text-base">
                What healthy goodness sounds amazing today?
              </p>
            </div>

            {/* Outlet Selector */}
            <Link
              href="/outlets"
              className="flex items-center gap-3 px-5 py-3 bg-white rounded-2xl border border-brand-gray-200 hover:border-brand-green shadow-sm hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-green/10 flex items-center justify-center group-hover:bg-brand-green/20 transition-colors">
                <MapPin className="w-5 h-5 text-brand-green" />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider mb-0.5">
                  OUTLET
                </p>
                <p className="text-sm font-bold text-brand-black">
                  {selectedOutlet ? selectedOutlet.name : "Select Location"}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-brand-gray-400 group-hover:text-brand-green group-hover:translate-x-1 transition-all" />
            </Link>
          </div>
        </motion.section>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Left: Hero Banner */}
          <motion.div className="lg:col-span-2" variants={fadeUp}>
            <div className="bg-gradient-to-br from-brand-yellow/10 via-white to-brand-green/5 rounded-3xl p-8 lg:p-10 border border-brand-yellow/30 relative overflow-hidden">
              {/* Background pattern */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-brand-yellow/5 rounded-full -mr-32 -mt-32" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-brand-green/5 rounded-full -ml-24 -mb-24" />

              {/* Badge */}
              <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full mb-4 border border-brand-green/20">
                <Sparkles className="w-4 h-4 text-brand-green" />
                <span className="text-xs font-bold text-brand-green-dark uppercase tracking-wider">
                  100% Natural & Fresh
                </span>
              </div>

              {/* Main text */}
              <h2 className="font-heading text-3xl lg:text-4xl font-bold text-brand-black leading-tight mb-3">
                Healthy never
                <br />
                <span className="text-brand-yellow">tasted this fun!</span>
              </h2>

              <p className="text-brand-gray-700 text-base mb-6 max-w-md">
                Fresh sprouts, power bowls & guilt-free drinks ready for pickup 🌱
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/menu"
                  className="inline-flex items-center gap-2 bg-brand-yellow hover:bg-brand-yellow-dark text-brand-black font-bold px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition-all"
                >
                  Explore Menu
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/outlets"
                  className="inline-flex items-center gap-2 bg-white hover:bg-brand-gray-50 text-brand-black font-bold px-6 py-3 rounded-xl border-2 border-brand-gray-200 hover:border-brand-gray-300 transition-all"
                >
                  <MapPin className="w-4 h-4" />
                  Find Outlets
                </Link>
              </div>
            </div>
          </motion.div>

          {/* Right: Wallet & Loyalty Cards */}
          {isLoggedIn && (
            <motion.div className="space-y-4" variants={fadeUp}>
              {/* Wallet Card */}
              <Link href="/wallet" className="block">
                <div className="bg-white rounded-2xl p-6 border border-brand-gray-200 hover:border-brand-green hover:shadow-xl transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-brand-green/10 flex items-center justify-center group-hover:bg-brand-green/20 transition-colors">
                        <Wallet className="w-6 h-6 text-brand-green" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-brand-gray-500 uppercase tracking-wider">
                          WALLET
                        </p>
                        {loading ? (
                          <Skeleton className="h-8 w-24 mt-1" />
                        ) : (
                          <p className="text-2xl font-heading font-bold text-brand-black">
                            {formatCurrency((wallet?.loaded_balance ?? 0) + (wallet?.bonus_balance ?? 0))}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-brand-green font-semibold text-sm">
                    <Plus className="w-4 h-4" />
                    <span>Add Money</span>
                    <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>

              {/* Loyalty Card */}
              <Link href="/loyalty" className="block">
                <div className="bg-white rounded-2xl p-6 border border-brand-gray-200 hover:border-purple-300 hover:shadow-xl transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                        <Star className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-brand-gray-500 uppercase tracking-wider">
                          POINTS
                        </p>
                        {loading ? (
                          <Skeleton className="h-8 w-24 mt-1" />
                        ) : (
                          <p className="text-2xl font-heading font-bold text-brand-black">
                            {loyaltyAccount?.current_points ?? 0}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-brand-gray-600 font-medium">Progress to next tier</span>
                      <span className="font-bold text-purple-600">{getTierDisplayName(loyaltyTier)}</span>
                    </div>
                    <div className="h-2 bg-brand-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: "60%" }}
                        transition={{ duration: 1, delay: 0.3 }}
                      />
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          )}
        </div>

        {/* Search Bar - Mobile Only */}
        <motion.section className="lg:hidden mb-6" variants={fadeUp}>
          <Link
            href="/search"
            className="flex items-center gap-3 w-full bg-white rounded-2xl px-5 py-4 border border-brand-gray-200 hover:border-brand-yellow shadow-sm transition-all"
          >
            <Search className="w-5 h-5 text-brand-gray-400" />
            <span className="text-sm text-brand-gray-500 font-medium">
              Search sprouts, bowls, drinks...
            </span>
          </Link>
        </motion.section>

        {/* Categories Section */}
        <motion.section className="mb-10" variants={fadeUp}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-heading text-2xl font-bold text-brand-black flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-brand-yellow" />
                Categories
              </h3>
              <p className="text-sm text-brand-gray-600">Browse by your mood</p>
            </div>
            <Link
              href="/menu"
              className="inline-flex items-center gap-1 text-sm font-bold text-brand-yellow-dark hover:text-brand-yellow transition-colors"
            >
              View All
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-2xl" />
              ))}
            </div>
          ) : categories.length > 0 ? (
            <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/menu?category=${cat.slug}`}
                  className="group"
                >
                  <div className="bg-white rounded-2xl p-4 border border-brand-gray-200 hover:border-brand-yellow hover:shadow-lg transition-all aspect-square flex flex-col items-center justify-center">
                    <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">
                      {getCategoryEmoji(cat.name)}
                    </span>
                    <p className="text-xs font-bold text-brand-black text-center line-clamp-2">
                      {cat.name}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 text-center border border-brand-gray-200">
              <p className="text-sm text-brand-gray-500">No categories available yet.</p>
            </div>
          )}
        </motion.section>

        {/* Popular Items Section */}
        <motion.section className="mb-10" variants={fadeUp}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-heading text-2xl font-bold text-brand-black flex items-center gap-2">
                <Flame className="w-6 h-6 text-orange-500" />
                Popular Items
              </h3>
              <p className="text-sm text-brand-gray-600">Everyone's favorite picks</p>
            </div>
            <Link
              href="/menu"
              className="inline-flex items-center gap-1 text-sm font-bold text-brand-yellow-dark hover:text-brand-yellow transition-colors"
            >
              View Menu
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="aspect-square rounded-2xl mb-3" />
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : popularItems.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {popularItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/menu?item=${item.slug}`}
                  className="group"
                >
                  <div className="bg-white rounded-2xl overflow-hidden border border-brand-gray-200 hover:border-brand-yellow hover:shadow-xl transition-all">
                    {/* Image */}
                    <div className="relative aspect-square bg-white overflow-hidden">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getImageUrl(item.image_url) ?? ""}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-5xl opacity-30">🌱</span>
                        </div>
                      )}

                      {/* Hot Badge */}
                      {item.is_bestseller && (
                        <div className="absolute top-2 left-2">
                          <div className="flex items-center gap-1 bg-gradient-to-r from-orange-500 to-red-500 px-2 py-1 rounded-lg shadow-md">
                            <Flame className="w-3 h-3 text-white" />
                            <span className="text-[10px] font-bold text-white uppercase">
                              HOT
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Veg/Non-veg Indicator */}
                      <div className={`absolute top-2 right-2 w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                        item.is_veg ? "border-green-600 bg-white" : "border-red-600 bg-white"
                      }`}>
                        <div className={`w-2.5 h-2.5 rounded-full ${
                          item.is_veg ? "bg-green-600" : "bg-red-600"
                        }`} />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <p className="text-sm font-bold text-brand-black leading-snug line-clamp-2 min-h-[2.5rem] mb-3">
                        {item.name}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-heading font-bold text-brand-black">
                          {formatCurrency(item.base_price)}
                        </span>
                        <button
                          type="button"
                          className="w-9 h-9 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark flex items-center justify-center shadow-sm hover:shadow-md transition-all active:scale-95"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <Plus className="w-5 h-5 text-brand-black" />
                        </button>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-12 text-center border border-brand-gray-200">
              <p className="text-base text-brand-gray-500">
                No popular items yet. Check back soon!
              </p>
            </div>
          )}
        </motion.section>

        {/* Active Campaigns */}
        {!loading && campaigns.length > 0 && (
          <motion.section variants={fadeUp}>
            <div className="mb-5">
              <h3 className="font-heading text-2xl font-bold text-brand-black flex items-center gap-2">
                <Gift className="w-6 h-6 text-purple-600" />
                Active Offers
              </h3>
              <p className="text-sm text-brand-gray-600">Limited time rewards & bonuses</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              {campaigns.slice(0, 2).map((campaign) => (
                <Link key={campaign.id} href="/loyalty">
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-6 hover:shadow-xl transition-all group relative overflow-hidden">
                    {/* Background pattern */}
                    <div className="absolute inset-0 opacity-10">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full -mr-16 -mt-16" />
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white rounded-full -ml-12 -mb-12" />
                    </div>

                    <div className="relative z-10">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                          <Gift className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                          <span className="text-xs font-bold text-white uppercase">ACTIVE</span>
                        </div>
                      </div>
                      <h4 className="font-heading text-xl font-bold text-white mb-2">
                        {campaign.name}
                      </h4>
                      <div className="flex items-center gap-2 text-white/90">
                        <span className="text-sm font-semibold">Learn More</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </motion.section>
        )}
      </motion.div>
    </div>
  );
}
