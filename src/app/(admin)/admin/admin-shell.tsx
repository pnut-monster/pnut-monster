"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  MapPin,
  Megaphone,
  Star,
  Users,
  BarChart3,
  Settings,
  Menu,
  X,
  User,
  ChevronRight,
  ChefHat,
  LogOut,
  ChevronDown,
  Ticket,
  Gift,
  Bell,
  ShieldCheck,
  Volume2,
  VolumeX,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import toast from "react-hot-toast";
import type { Order } from "@/lib/supabase/types";

const SIDEBAR_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/admin/outlets", label: "Outlets", icon: MapPin },
  { href: "/admin/inventory", label: "Inventory", icon: Package },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket },
  { href: "/admin/gift-cards", label: "Gift Cards", icon: Gift },
  { href: "/admin/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/loyalty", label: "Loyalty", icon: Star },
  { href: "/admin/customers", label: "Customers & Staff", icon: Users },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/security", label: "Security", icon: ShieldCheck },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

function getPageTitle(pathname: string): string {
  const item = SIDEBAR_ITEMS.find((i) =>
    i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href)
  );
  return item?.label ?? "Admin";
}

export function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [orderSoundEnabled, setOrderSoundEnabled] = useState(() =>
    typeof window === "undefined" || localStorage.getItem("pnut_admin_order_sound") !== "false"
  );
  const audioContextRef = useRef<AudioContext | null>(null);
  const [adminUser, setAdminUser] = useState<{ name: string; email: string; role: string }>({
    name: "Admin",
    email: "",
    role: "",
  });
  const pageTitle = getPageTitle(pathname);
  const supabase = createClient();

  const playNewOrderSound = useCallback(async (force = false) => {
    if (!orderSoundEnabled && !force) return;
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      if (context.state === "suspended") await context.resume();
      const start = context.currentTime;
      [660, 880, 1040].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + index * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.22, start + index * 0.16 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.16 + 0.14);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start + index * 0.16);
        oscillator.stop(start + index * 0.16 + 0.15);
      });
    } catch (error) {
      console.warn("[Admin] Could not play order notification sound", error);
    }
  }, [orderSoundEnabled]);

  // Authentication pages render without the admin navigation shell.
  const isAuthPage =
    pathname === "/admin/login" || pathname.startsWith("/admin/mfa/");

  useEffect(() => {
    if (isAuthPage) return;

    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/admin/login");
          return;
        }

        const res = await fetch("/api/admin/verify-role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }),
        });

        if (!res.ok) {
          router.push("/admin/login");
          return;
        }

        const { role, full_name } = await res.json();

        if (role !== "admin" && role !== "super_admin") {
          router.push("/admin/login");
          return;
        }

        setAdminUser({
          name: full_name ?? "Admin",
          email: user.email ?? "",
          role: role === "super_admin" ? "Super Admin" : "Admin",
        });
      } catch {
        router.push("/admin/login");
      }
    };

    checkAuth();
  }, [isAuthPage, supabase, router]);

  useEffect(() => {
    if (isAuthPage || !adminUser.role) return;
    const channel = supabase
      .channel("admin-global-new-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const order = payload.new as Order;
          void playNewOrderSound();
          toast.success(
            `New order #${order.order_number}${order.total ? ` • ₹${Number(order.total).toFixed(2)}` : ""}`,
            { duration: 8000, icon: "🔔" }
          );
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [adminUser.role, isAuthPage, playNewOrderSound, supabase]);

  useEffect(() => () => {
    void audioContextRef.current?.close();
  }, []);

  if (isAuthPage) {
    return <>{children}</>;
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore errors
    }
    router.push("/admin/login");
  };

  const toggleOrderSound = () => {
    const next = !orderSoundEnabled;
    setOrderSoundEnabled(next);
    localStorage.setItem("pnut_admin_order_sound", String(next));
    if (next) {
      void playNewOrderSound(true);
      toast.success("New-order sound enabled");
    } else {
      toast("New-order sound muted", { icon: "🔕" });
    }
  };

  return (
    <div className="min-h-dvh bg-brand-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-dvh w-64 bg-brand-black flex flex-col transition-transform duration-200 ease-in-out",
          "lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/10">
          <Link href="/admin" className="flex items-center gap-2">
            <Image
              src="/logo.webp"
              alt="PNUT MONSTER"
              width={128}
              height={40}
              priority
              className="h-10 w-auto object-contain brightness-110"
            />
          </Link>
          <button
            type="button"
            className="lg:hidden p-1 text-brand-cream hover:text-white"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {SIDEBAR_ITEMS.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-yellow text-brand-black"
                    : "text-brand-cream/70 hover:text-brand-cream hover:bg-white/5"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
                {isActive && (
                  <ChevronRight className="w-4 h-4 ml-auto" />
                )}
              </Link>
            );
          })}

          {/* Restaurant Panel link */}
          <div className="pt-2 mt-2 border-t border-white/10">
            <a
              href="/restaurant"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-cream/50 hover:text-brand-cream hover:bg-white/5 transition-colors"
            >
              <ChefHat className="w-5 h-5 shrink-0" />
              <span>Restaurant Panel</span>
            </a>
          </div>
        </nav>

        {/* Admin user */}
        <div className="px-4 py-3 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-yellow flex items-center justify-center">
              <User className="w-4 h-4 text-brand-black" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brand-cream truncate">
                {adminUser.name}
              </p>
              <p className="text-xs text-brand-cream/50 truncate">
                {adminUser.email}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="lg:ml-64 min-h-dvh flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white shadow-sm">
          <div className="flex items-center justify-between px-4 lg:px-6 h-16">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="lg:hidden p-2 rounded-lg hover:bg-brand-gray-100 transition-colors"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu className="w-5 h-5 text-brand-gray-700" />
              </button>
              <h1 className="font-heading text-xl font-bold text-brand-black">
                {pageTitle}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleOrderSound}
                className="p-2 rounded-lg hover:bg-brand-gray-100 transition-colors"
                aria-label={orderSoundEnabled ? "Mute new order sound" : "Enable new order sound"}
                title={orderSoundEnabled ? "Mute new order sound" : "Enable new order sound"}
              >
                {orderSoundEnabled ? (
                  <Volume2 className="w-5 h-5 text-brand-green" />
                ) : (
                  <VolumeX className="w-5 h-5 text-brand-gray-400" />
                )}
              </button>

              {/* User dropdown */}
              <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-brand-gray-50 transition-colors"
              >
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-semibold text-brand-black">{adminUser.name}</p>
                  <p className="text-xs text-brand-gray-500">{adminUser.role}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-brand-yellow flex items-center justify-center">
                  <User className="w-4 h-4 text-brand-black" />
                </div>
                <ChevronDown className="w-4 h-4 text-brand-gray-400 hidden sm:block" />
              </button>

              {/* Dropdown menu */}
              {userDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-brand-gray-100 py-1 z-50">
                    <div className="px-4 py-2 border-b border-brand-gray-100">
                      <p className="text-sm font-semibold text-brand-black">{adminUser.name}</p>
                      <p className="text-xs text-brand-gray-500">{adminUser.email}</p>
                    </div>
                    <Link
                      href="/admin/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-brand-gray-700 hover:bg-brand-gray-50 transition-colors"
                    >
                      <User className="w-4 h-4" />
                      Profile
                    </Link>
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        handleSignOut();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
