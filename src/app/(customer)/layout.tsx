"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, UtensilsCrossed, ShoppingBag, Wallet, User, Bell } from "lucide-react";
import { cn } from "@/lib/utils/helpers";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

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

  if (isFullScreenPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-dvh flex flex-col bg-brand-cream">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm safe-top">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.webp" alt="PNUT MONSTER" className="h-9 w-auto object-contain" />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/notifications"
              className="relative p-2 rounded-full hover:bg-brand-gray-100 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-brand-gray-600" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-red rounded-full" />
            </Link>

            <Link
              href="/profile"
              className="w-8 h-8 rounded-full bg-brand-yellow flex items-center justify-center"
              aria-label="Profile"
            >
              <User className="w-4 h-4 text-brand-black" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pt-14 pb-20">{children}</main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.08)] safe-bottom">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
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
