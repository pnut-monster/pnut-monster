"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  MapPin,
  Bell,
  Gift,
  HelpCircle,
  Info,
  LogOut,
  Copy,
  Check,
  ChevronRight,
  ShoppingBag,
  Wallet,
  Star,
  Edit,
  ChevronLeft,
  Loader2,
  Save,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, cn } from "@/lib/utils/helpers";
import { Spinner } from "@/components/ui/spinner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type {
  Profile,
  Wallet as WalletType,
  LoyaltyAccount,
  LoyaltyTier,
} from "@/lib/supabase/types";
import toast from "react-hot-toast";

const TIER_DISPLAY: Record<string, { label: string; variant: "warning" | "info" | "default" }> = {
  sprout_star: { label: "Sprout Star", variant: "warning" },
  sprout_hero: { label: "Sprout Hero", variant: "info" },
  pnut_legend: { label: "PNUT Legend", variant: "default" },
};

interface MenuItem {
  label: string;
  description?: string;
  icon: React.ElementType;
  href?: string;
  action?: () => void;
  color?: string;
  comingSoon?: boolean;
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);
  const [currentTier, setCurrentTier] = useState<LoyaltyTier | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Edit profile state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editDob, setEditDob] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      const p = profileData as Profile | null;
      setProfile(p);

      // Fetch wallet
      const { data: walletData } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", user.id)
        .single();
      setWallet(walletData as WalletType | null);

      // Fetch loyalty
      const { data: loyaltyData } = await supabase
        .from("loyalty_accounts")
        .select("*")
        .eq("user_id", user.id)
        .single();
      const la = loyaltyData as LoyaltyAccount | null;
      setLoyaltyAccount(la);

      if (la) {
        const { data: tierData } = await supabase
          .from("loyalty_tiers")
          .select("*")
          .eq("id", la.tier_id)
          .single();
        setCurrentTier(tierData as LoyaltyTier | null);
      }

      // Count orders
      const { count } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      setOrderCount(count ?? 0);
    } catch (err) {
      console.error("Failed to fetch profile data:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCopyReferral = async () => {
    if (!profile?.referral_code) return;
    try {
      await navigator.clipboard.writeText(profile.referral_code);
      setCopied(true);
      toast.success("Referral code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.replace("/login");
    } catch {
      toast.error("Failed to sign out");
      setSigningOut(false);
    }
  };

  const handleStartEditing = () => {
    setEditName(profile?.full_name ?? "");
    setEditEmail(profile?.email ?? "");
    setEditDob(profile?.date_of_birth ?? "");
    setEditing(true);
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: profile.id,
          full_name: editName || null,
          email: editEmail || null,
          date_of_birth: editDob || null,
        } as never);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Profile updated!");
      setEditing(false);
      setLoading(true);
      await fetchData();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
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
  const tierSlug = currentTier?.slug ?? "sprout_star";
  const tierInfo = TIER_DISPLAY[tierSlug] ?? {
    label: currentTier?.name ?? "Sprout Star",
    variant: "warning" as const,
  };

  const menuItems: MenuItem[] = [
    {
      label: "Edit Profile",
      icon: Edit,
      action: handleStartEditing,
      color: "text-brand-gray-600",
    },
    {
      label: "My Addresses",
      icon: MapPin,
      color: "text-blue-500",
      comingSoon: true,
    },
    {
      label: "Notifications",
      icon: Bell,
      href: "/notifications",
      color: "text-brand-yellow-dark",
      comingSoon: true,
    },
    {
      label: "Referral Program",
      description: "Invite friends & earn rewards",
      icon: Gift,
      href: "/referral",
      color: "text-green-500",
    },
    {
      label: "Help & Support",
      icon: HelpCircle,
      color: "text-purple-500",
      comingSoon: true,
    },
    {
      label: "About PNUT MONSTER",
      icon: Info,
      color: "text-brand-gray-500",
      comingSoon: true,
    },
  ];

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
            <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider">PROFILE</p>
            <h1 className="text-lg font-bold font-[family-name:var(--font-heading)] text-brand-black">
              My Profile
            </h1>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">
        {/* Profile Header */}
        {!editing ? (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-brand-gray-200">
            <div className="flex items-center gap-4">
              <Avatar
                src={profile?.avatar_url}
                name={profile?.full_name ?? undefined}
                size="lg"
              />
              <div className="flex-1 min-w-0">
                <p className="font-heading text-lg font-bold text-brand-black truncate">
                  {profile?.full_name || "PNUT Lover"}
                </p>
                {profile?.phone && (
                  <p className="text-sm text-brand-gray-500">{profile.phone}</p>
                )}
                {profile?.email && (
                  <p className="text-xs text-brand-gray-400 truncate">
                    {profile.email}
                  </p>
                )}
                <div className="mt-1.5">
                  <Badge variant={tierInfo.variant}>{tierInfo.label}</Badge>
                </div>
              </div>
            </div>
          </div>
        ) : (
        /* Edit Profile Form */
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-brand-gray-200 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-base font-bold text-brand-black">
              Edit Profile
            </h3>
            <button
              onClick={() => setEditing(false)}
              className="p-1 rounded-lg hover:bg-brand-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-brand-gray-500" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-gray-500 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Enter your name"
              className="w-full border-2 border-brand-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-brand-yellow outline-none transition-colors placeholder:text-brand-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-gray-500 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full border-2 border-brand-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-brand-yellow outline-none transition-colors placeholder:text-brand-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-gray-500 mb-1.5">
              Date of Birth
            </label>
            <input
              type="date"
              value={editDob}
              onChange={(e) => setEditDob(e.target.value)}
              className="w-full border-2 border-brand-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-brand-yellow outline-none transition-colors text-brand-gray-700"
            />
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3 rounded-xl text-sm hover:bg-brand-yellow-dark transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/orders"
          className="bg-white rounded-xl p-3 shadow-sm border border-brand-gray-200 text-center hover:shadow-md transition-shadow"
        >
          <ShoppingBag className="w-5 h-5 text-brand-yellow-dark mx-auto" />
          <p className="font-heading text-lg font-bold text-brand-black mt-1">
            {orderCount}
          </p>
          <p className="text-[10px] text-brand-gray-500 font-medium">Orders</p>
        </Link>
        <Link
          href="/wallet"
          className="bg-white rounded-xl p-3 shadow-sm border border-brand-gray-200 text-center hover:shadow-md transition-shadow"
        >
          <Wallet className="w-5 h-5 text-green-500 mx-auto" />
          <p className="font-heading text-lg font-bold text-brand-black mt-1">
            {formatCurrency(totalBalance)}
          </p>
          <p className="text-[10px] text-brand-gray-500 font-medium">Wallet</p>
        </Link>
        <Link
          href="/loyalty"
          className="bg-white rounded-xl p-3 shadow-sm border border-brand-gray-200 text-center hover:shadow-md transition-shadow"
        >
          <Star className="w-5 h-5 text-purple-500 mx-auto" />
          <p className="font-heading text-lg font-bold text-brand-black mt-1">
            {(loyaltyAccount?.current_points ?? 0).toLocaleString("en-IN")}
          </p>
          <p className="text-[10px] text-brand-gray-500 font-medium">Points</p>
        </Link>
      </div>

      {/* Menu Items */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-gray-200 divide-y divide-brand-gray-100 overflow-hidden">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const content = (
            <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-brand-gray-50 transition-colors">
              <Icon
                className={cn("w-5 h-5 shrink-0", item.color ?? "text-brand-gray-500")}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-brand-black">
                    {item.label}
                  </p>
                  {item.comingSoon && (
                    <Badge variant="default">Soon</Badge>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-brand-gray-400 mt-0.5">
                    {item.description}
                  </p>
                )}
              </div>
              {item.label === "Referral Code" ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCopyReferral();
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCopyReferral(); }}
                  className="p-1.5 rounded-lg hover:bg-brand-gray-100 transition-colors cursor-pointer"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-brand-gray-400" />
                  )}
                </span>
              ) : (
                <ChevronRight className="w-4 h-4 text-brand-gray-300 shrink-0" />
              )}
            </div>
          );

          if (item.href) {
            return (
              <Link key={item.label} href={item.href}>
                {content}
              </Link>
            );
          }

          return (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className="w-full text-left"
            >
              {content}
            </button>
          );
        })}
      </div>

        {/* Sign Out */}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 font-bold py-3.5 rounded-xl text-sm hover:bg-red-100 transition-colors border border-red-100 disabled:opacity-50"
        >
          {signingOut ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <LogOut className="w-4 h-4" />
              Sign Out
            </>
          )}
        </button>

        {/* Bottom spacer for safe area */}
        <div className="h-4" />
      </div>
    </div>
  );
}
