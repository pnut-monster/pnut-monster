"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getImageUrl } from "@/lib/utils/image";
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
  Gift,
  ShoppingBag,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { useCartStore } from "@/lib/stores/cart-store";
import { formatCurrency } from "@/lib/utils/helpers";
import { Skeleton } from "@/components/ui/skeleton";

import type {
  Profile,
  MenuCategory,
  MenuItem,
  Wallet as WalletType,
  LoyaltyAccount,
  Campaign,
} from "@/lib/supabase/types";

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

export default function CustomerHomePage() {
  const { selectedOutlet } = useOutletStore();
  const cartItemCount = useCartStore((s) => s.getItemCount());

  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [popularItems, setPopularItems] = useState<MenuItem[]>([]);
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function loadData() {
      const withTimeout = async <T,>(
        promise: PromiseLike<T>,
        fallback: T,
        ms = 5000
      ) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<T>((resolve) => {
          timeoutId = setTimeout(() => resolve(fallback), ms);
        });

        try {
          return await Promise.race([Promise.resolve(promise), timeout]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      };

      try {
        await withTimeout(
          Promise.allSettled([
            supabase
              .from("menu_categories")
              .select("*")
              .eq("is_active", true)
              .order("sort_order")
              .then(({ data }) => setCategories((data as MenuCategory[]) ?? [])),
            supabase
              .from("menu_items")
              .select("*")
              .eq("is_bestseller", true)
              .eq("is_active", true)
              .order("sort_order")
              .limit(10)
              .then(({ data }) => setPopularItems((data as MenuItem[]) ?? [])),
          ]),
          null,
          3000
        );
      } catch {
        // Public content should never block the rest of the page.
      } finally {
        setLoading(false);
      }

      try {
        const session = await withTimeout(
          supabase.auth.getSession().then(({ data }) => data.session).catch(() => null),
          null,
          1500
        );
        const user = session?.user;
        const loggedIn = !!user;
        setIsLoggedIn(loggedIn);

        if (!loggedIn || !user) {
          return;
        }

        await withTimeout(
          Promise.allSettled([
            supabase
              .from("profiles")
              .select("*")
              .eq("id", user.id)
              .single()
              .then(({ data }) => setProfile(data as Profile | null)),
            supabase
              .from("wallets")
              .select("*")
              .eq("user_id", user.id)
              .single()
              .then(({ data }) => setWallet(data as WalletType | null)),
            supabase
              .from("loyalty_accounts")
              .select("*")
              .eq("user_id", user.id)
              .single()
              .then(({ data }) => setLoyaltyAccount(data as LoyaltyAccount | null)),
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
                  camps.filter((c) => c.starts_at <= now && c.ends_at >= now)
                );
              }),
            supabase
              .from("orders")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .eq("status", "picked_up")
              .then(({ count }) => setOrderCount(count ?? 0)),
          ]),
          null,
          5000
        );
      } catch {
        setIsLoggedIn(false);
      }
    }

    loadData();
  }, []);

  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <div className="pb-8">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        {/* Header Section */}
        <section className="pt-6 pb-8">
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
        </section>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Left: Hero Banner */}
          <div className="lg:col-span-2">
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
          </div>

          {/* Right: Wallet & Loyalty Cards */}
          {isLoggedIn && (
            <div className="space-y-4">
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
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                        <Star className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-brand-gray-500 uppercase tracking-wider">
                          ORDERS
                        </p>
                        {loading ? (
                          <Skeleton className="h-8 w-16 mt-1" />
                        ) : (
                          <p className="text-2xl font-heading font-bold text-brand-black">
                            {orderCount}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-brand-gray-500 uppercase tracking-wider">
                        POINTS
                      </p>
                      {loading ? (
                        <Skeleton className="h-8 w-16 mt-1" />
                      ) : (
                        <p className="text-2xl font-heading font-bold text-purple-600">
                          {loyaltyAccount?.current_points ?? 0}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          )}
        </div>

        {/* Search Bar - Mobile Only */}
        <section className="lg:hidden mb-6">
          <Link
            href="/search"
            className="flex items-center gap-3 w-full bg-white rounded-2xl px-5 py-4 border border-brand-gray-200 hover:border-brand-yellow shadow-sm transition-all"
          >
            <Search className="w-5 h-5 text-brand-gray-400" />
            <span className="text-sm text-brand-gray-500 font-medium">
              Search sprouts, bowls, drinks...
            </span>
          </Link>
        </section>

        {/* Categories Section */}
        <section className="mb-10">
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
        </section>

        {/* Popular Items Section */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-heading text-2xl font-bold text-brand-black flex items-center gap-2">
                <Flame className="w-6 h-6 text-orange-500" />
                Popular Items
              </h3>
              <p className="text-sm text-brand-gray-600">Everyone&apos;s favorite picks</p>
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
                        <Image
                          src={getImageUrl(item.image_url) ?? ""}
                          alt={item.name}
                          fill
                          sizes="(max-width: 1024px) 50vw, 25vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
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
        </section>

        {/* Active Campaigns */}
        {!loading && campaigns.length > 0 && (
          <section>
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
          </section>
        )}
      </div>

      {/* Floating Cart Button */}
      {cartItemCount > 0 && (
        <Link
          href="/cart"
          className="fixed bottom-24 right-4 z-50 flex items-center gap-2 bg-brand-yellow hover:bg-brand-yellow-dark text-brand-black font-bold px-5 py-3.5 rounded-2xl shadow-xl hover:shadow-2xl transition-all active:scale-95"
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="text-sm">{cartItemCount} {cartItemCount === 1 ? "item" : "items"}</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
