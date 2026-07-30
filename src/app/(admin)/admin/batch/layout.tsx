"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/helpers";

const TABS = [
  { href: "/admin/batch", label: "Locations" },
  { href: "/admin/batch/windows", label: "Windows" },
  { href: "/admin/batch/reps", label: "Representatives" },
  { href: "/admin/batch/settings", label: "Settings" },
];

export default function BatchLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <nav className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map(tab => {
          const isActive = tab.href === "/admin/batch"
            ? pathname === "/admin/batch"
            : pathname.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-brand-green text-brand-green"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
