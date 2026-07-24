"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  Settings,
  Menu,
  X,
  User,
  ChevronRight,
  Bell,
  ChevronDown,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { createClient } from "@/lib/supabase/client";
import type { Outlet, Order, Profile } from "@/lib/supabase/types";
import toast from "react-hot-toast";

const SIDEBAR_ITEMS = [
  { href: "/restaurant", label: "Dashboard", icon: LayoutDashboard },
  { href: "/restaurant/orders", label: "Orders", icon: ShoppingBag },
  { href: "/restaurant/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/restaurant/settings", label: "Settings", icon: Settings },
] as const;

function getPageTitle(pathname: string): string {
  const item = SIDEBAR_ITEMS.find((i) =>
    i.href === "/restaurant" ? pathname === "/restaurant" : pathname.startsWith(i.href)
  );
  return item?.label ?? "Restaurant";
}

export function RestaurantShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [outletSelectorOpen, setOutletSelectorOpen] = useState(false);
  const [staffProfile, setStaffProfile] = useState<Profile | null>(null);
  const [managedOutlets, setManagedOutlets] = useState<Outlet[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(null);
  const [orderSoundEnabled, setOrderSoundEnabled] = useState(() =>
    typeof window === "undefined" || localStorage.getItem("pnut_restaurant_order_sound") !== "false"
  );
  const audioContextRef = useRef<AudioContext | null>(null);
  const pageTitle = getPageTitle(pathname);
  const supabase = createClient();

  // Skip layout for login page
  const isLoginPage = pathname === "/restaurant/login";

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
      console.warn("[Restaurant] Could not play order notification sound", error);
    }
  }, [orderSoundEnabled]);

  const toggleOrderSound = useCallback(() => {
    const next = !orderSoundEnabled;
    setOrderSoundEnabled(next);
    localStorage.setItem("pnut_restaurant_order_sound", String(next));
    if (next) {
      void playNewOrderSound(true);
      toast.success("New-order sound enabled");
    } else {
      toast("New-order sound muted", { icon: "🔕" });
    }
  }, [orderSoundEnabled, playNewOrderSound]);

  useEffect(() => {
    async function loadStaffData() {
      const supabase = createClient();

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          // Fetch profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

          const typedProfile = profile as Profile | null;
          if (typedProfile) {
            setStaffProfile(typedProfile);
          }

          let outlets: Outlet[] = [];
          if (typedProfile && ["admin", "super_admin"].includes(typedProfile.role)) {
            const { data } = await supabase
              .from("outlets")
              .select("*")
              .eq("is_active", true)
              .order("name");
            outlets = (data as Outlet[] | null) ?? [];
          } else {
            const { data: assignments } = await supabase
              .from("outlet_staff" as never)
              .select("outlet_id")
              .eq("user_id" as never, user.id as never);
            const outletIds = ((assignments as { outlet_id: string }[] | null) ?? [])
              .map((assignment) => assignment.outlet_id);

            if (outletIds.length > 0) {
              const { data } = await supabase
                .from("outlets")
                .select("*")
                .in("id", outletIds)
                .eq("is_active", true)
                .order("name");
              outlets = (data as Outlet[] | null) ?? [];
            }
          }

          if (outlets.length > 0) {
            setManagedOutlets(outlets);
            // Restore selected outlet from localStorage
            const savedOutletId = localStorage.getItem("pnut_selected_outlet");
            const saved = outlets.find((o) => o.id === savedOutletId);
            const nextOutlet = saved ?? outlets[0];
            setSelectedOutlet(nextOutlet);
            localStorage.setItem("pnut_selected_outlet", nextOutlet.id);
            return;
          }
        }
        throw new Error("No auth or outlets");
      } catch (err) {
        console.error("Failed to load staff data:", err);
      }
    }

    if (!isLoginPage) {
      loadStaffData();
    }
  }, [isLoginPage]);

  useEffect(() => {
    if (isLoginPage || !selectedOutlet) return;
    const channel = supabase
      .channel("restaurant-new-orders-" + selectedOutlet.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `outlet_id=eq.${selectedOutlet.id}` },
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
  }, [isLoginPage, selectedOutlet, playNewOrderSound, supabase]);

  useEffect(() => () => {
    void audioContextRef.current?.close();
  }, []);

  function handleOutletChange(outlet: Outlet) {
    setSelectedOutlet(outlet);
    localStorage.setItem("pnut_selected_outlet", outlet.id);
    setOutletSelectorOpen(false);
    router.refresh();
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

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
          "fixed top-0 left-0 z-50 h-dvh w-64 bg-brand-gray-900 flex flex-col transition-transform duration-200 ease-in-out",
          "lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header with outlet name */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/10">
          <Link href="/restaurant" className="flex items-center gap-2 min-w-0">
            <Image
              src="/logo.webp"
              alt="PNUT MONSTER"
              width={115}
              height={36}
              priority
              className="h-9 w-auto object-contain brightness-110 shrink-0"
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

        {/* Outlet selector */}
        {managedOutlets.length > 1 && (
          <div className="px-3 py-3 border-b border-white/10">
            <div className="relative">
              <button
                type="button"
                onClick={() => setOutletSelectorOpen(!outletSelectorOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-brand-cream transition-colors"
              >
                <span className="truncate font-medium">
                  {selectedOutlet?.name?.replace("PNUT MONSTER - ", "") ?? "Select Outlet"}
                </span>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 shrink-0 ml-2 transition-transform",
                    outletSelectorOpen && "rotate-180"
                  )}
                />
              </button>

              {outletSelectorOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-brand-gray-800 rounded-lg shadow-lg border border-white/10 py-1 z-10 max-h-48 overflow-y-auto">
                  {managedOutlets.map((outlet) => (
                    <button
                      key={outlet.id}
                      type="button"
                      onClick={() => handleOutletChange(outlet)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm transition-colors",
                        outlet.id === selectedOutlet?.id
                          ? "bg-brand-green/20 text-brand-green font-semibold"
                          : "text-brand-cream/70 hover:bg-white/5 hover:text-brand-cream"
                      )}
                    >
                      {outlet.name.replace("PNUT MONSTER - ", "")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {SIDEBAR_ITEMS.map((item) => {
            const isActive =
              item.href === "/restaurant"
                ? pathname === "/restaurant"
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
                    ? "bg-brand-green text-white"
                    : "text-brand-cream/70 hover:text-brand-cream hover:bg-white/5"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* Staff user */}
        <div className="px-4 py-3 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-green flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brand-cream truncate">
                {staffProfile?.full_name ?? "Staff"}
              </p>
              <p className="text-xs text-brand-cream/50 truncate">
                {staffProfile?.email ?? ""}
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
              <div>
                <h1 className="font-heading text-xl font-bold text-brand-black">
                  {pageTitle}
                </h1>
                {selectedOutlet && (
                  <p className="text-xs text-brand-gray-500 -mt-0.5">
                    {selectedOutlet.name.replace("PNUT MONSTER - ", "")}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Order sound toggle */}
              <button
                type="button"
                onClick={toggleOrderSound}
                className="p-2 rounded-lg hover:bg-brand-gray-100 transition-colors"
                aria-label={orderSoundEnabled ? "Mute order sound" : "Enable order sound"}
                title={orderSoundEnabled ? "Order sound on" : "Order sound off"}
              >
                {orderSoundEnabled ? (
                  <Volume2 className="w-5 h-5 text-brand-green" />
                ) : (
                  <VolumeX className="w-5 h-5 text-brand-gray-400" />
                )}
              </button>

              {/* Notifications bell */}
              <Link
                href="/restaurant/orders"
                className="relative p-2 rounded-lg hover:bg-brand-gray-100 transition-colors"
                aria-label="View orders"
              >
                <Bell className="w-5 h-5 text-brand-gray-700" />
              </Link>

              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold text-brand-black">
                  {staffProfile?.full_name ?? "Staff"}
                </p>
                <p className="text-xs text-brand-gray-500">Outlet Staff</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-brand-green flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>
        </header>

        {/* Content — pass selected outlet via data attribute for child pages to read */}
        <main className="flex-1 p-4 lg:p-6" data-outlet-id={selectedOutlet?.id ?? ""}>
          {children}
        </main>
      </div>
    </div>
  );
}
