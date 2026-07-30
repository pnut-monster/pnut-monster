"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui";
import { Package, List, QrCode, Wallet, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/helpers";

const NAV_ITEMS = [
  { href: "/rep", label: "Dashboard", icon: Package },
  { href: "/rep/orders", label: "Orders", icon: List },
  { href: "/rep/scan", label: "Scan", icon: QrCode },
  { href: "/rep/ledger", label: "Earnings", icon: Wallet },
];

export default function RepLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [repName, setRepName] = useState("");

  useEffect(() => {
    const supabase = createClient();
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "representative") {
        router.replace("/");
        return;
      }

      setRepName(profile.full_name || "Rep");
      setLoading(false);
    }
    checkAuth();
  }, [router]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">PNUT MONSTER · Rep Panel</p>
          <p className="text-sm font-bold text-gray-900">{repName}</p>
        </div>
        <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Logout">
          <LogOut size={18} />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 p-4">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-gray-200 flex items-center justify-around py-2 px-4">
        {NAV_ITEMS.map(item => {
          const isActive = item.href === "/rep" ? pathname === "/rep" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors",
                isActive ? "text-brand-green" : "text-gray-400"
              )}>
              <item.icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
