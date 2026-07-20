"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Home, UtensilsCrossed, ShoppingBag, Wallet, User, Bell, Search } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export function CustomerShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  const fetchUnreadCount = useCallback(async (userId: string) => {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    setUnreadCount(count ?? 0);
  }, [supabase]);

  // Hide shell on auth pages and full-screen flows
  const isFullScreenPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/verify" ||
    pathname === "/forgot-password" ||
    pathname === "/profile-setup" ||
    pathname.startsWith("/auth/callback") ||
    pathname === "/cart" ||
    pathname === "/checkout" ||
    (pathname.startsWith("/menu/") && pathname !== "/menu");

  useEffect(() => {
    if (isFullScreenPage) {
      return;
    }

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const setupNotifications = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (cancelled) return;

      if (!userId) {
        setUnreadCount(0);
        return;
      }

      await fetchUnreadCount(userId);

      if (cancelled) return;

      channel = supabase
        .channel(`customer-notifications-shell-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            fetchUnreadCount(userId);
          }
        )
        .subscribe();
    };

    const browserWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (browserWindow.requestIdleCallback) {
      idleId = browserWindow.requestIdleCallback(setupNotifications, {
        timeout: 1500,
      });
    } else {
      timer = setTimeout(setupNotifications, 300);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (idleId !== null) browserWindow.cancelIdleCallback?.(idleId);
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchUnreadCount, isFullScreenPage, supabase]);

  if (isFullScreenPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-dvh bg-brand-cream">
      {/* Desktop Sidebar - Only on larger screens */}
      <aside className="hidden lg:fixed lg:left-0 lg:top-0 lg:h-screen lg:w-64 lg:flex lg:flex-col bg-white border-r border-brand-gray-200 z-40">
        {/* Logo */}
        <div className="p-6 border-b border-brand-gray-200">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.webp"
              alt="PNUT MONSTER"
              width={154}
              height={48}
              priority
              className="h-12 w-auto object-contain"
            />
          </Link>
          <p className="text-[10px] text-brand-gray-500 mt-1 font-semibold">Healthy never tasted this fun!</p>
        </div>

        {/* Desktop Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={item.href === "/orders" || item.href === "/wallet"}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all",
                  isActive
                    ? "bg-brand-yellow text-brand-black shadow-md"
                    : "text-brand-gray-600 hover:bg-brand-gray-50 hover:text-brand-black"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Desktop Footer */}
        <div className="p-4 border-t border-brand-gray-200">
          <Link
            href="/profile"
            prefetch={false}
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-brand-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-brand-yellow flex items-center justify-center">
              <User className="w-5 h-5 text-brand-black" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-brand-black truncate">Your Profile</p>
              <p className="text-xs text-brand-gray-500">View & Edit</p>
            </div>
          </Link>
        </div>
      </aside>

      {/* Mobile/Desktop Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-brand-gray-100 safe-top lg:left-64">
        <div className="flex items-center justify-between px-4 lg:px-8 h-16">
          {/* Mobile Logo */}
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <Image
              src="/logo.webp"
              alt="PNUT MONSTER"
              width={115}
              height={36}
              priority
              className="h-9 w-auto object-contain"
            />
          </Link>

          {/* Desktop Search Bar */}
          <div className="hidden lg:flex flex-1 max-w-xl">
            <Link
              href="/search"
              prefetch={false}
              className="flex items-center gap-3 w-full bg-white rounded-xl px-4 py-2.5 border border-brand-gray-200 hover:border-brand-yellow transition-colors"
            >
              <Search className="w-4.5 h-4.5 text-brand-gray-400" />
              <span className="text-sm text-brand-gray-400">
                Search for sprouts, bowls, drinks...
              </span>
            </Link>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 lg:gap-4">
            {/* Mobile Search */}
            <Link
              href="/search"
              prefetch={false}
              className="lg:hidden p-2 rounded-full hover:bg-brand-gray-100 transition-colors"
              aria-label="Search"
            >
              <Search className="w-5 h-5 text-brand-gray-600" />
            </Link>

            {/* Notifications */}
            <Link
              href="/notifications"
              prefetch={false}
              className="relative p-2 rounded-full hover:bg-brand-gray-100 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-brand-gray-600" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand-red px-1 text-center text-[10px] font-bold leading-4 text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>

            {/* Desktop Profile */}
            <Link
              href="/profile"
              prefetch={false}
              className="hidden lg:flex w-10 h-10 rounded-full bg-brand-yellow items-center justify-center hover:bg-brand-yellow-dark transition-colors"
              aria-label="Profile"
            >
              <User className="w-5 h-5 text-brand-black" />
            </Link>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-16 pb-20 lg:pb-8 lg:pl-64 min-h-dvh">{children}</main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-lg border-t border-brand-gray-100 safe-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={item.href === "/orders" || item.href === "/wallet"}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors",
                  isActive
                    ? "text-brand-yellow"
                    : "text-brand-gray-400 hover:text-brand-gray-600"
                )}
              >
                <Icon
                  className="w-5 h-5"
                  fill={isActive ? "currentColor" : "none"}
                  strokeWidth={isActive ? 1.5 : 2}
                />
                <span
                  className={cn(
                    "text-[10px] leading-tight",
                    isActive ? "font-bold" : "font-medium"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
