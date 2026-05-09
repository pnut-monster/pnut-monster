"use client";

import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils/helpers";

interface Tab {
  label: string;
  value: string;
}

interface TabsProps {
  tabs: Tab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeRect, setActiveRect] = useState<{ left: number; width: number } | null>(null);

  // Scroll active tab into view and measure for underline
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeButton = container.querySelector<HTMLButtonElement>(
      `[data-tab-value="${value}"]`
    );
    if (!activeButton) return;

    activeButton.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    setActiveRect({
      left: buttonRect.left - containerRect.left + container.scrollLeft,
      width: buttonRect.width,
    });
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={containerRef}
        className="flex gap-1 overflow-x-auto no-scrollbar"
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            data-tab-value={tab.value}
            aria-selected={value === tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              "shrink-0 px-4 py-2.5 text-sm font-semibold font-[family-name:var(--font-heading)] transition-colors duration-150 whitespace-nowrap",
              value === tab.value
                ? "text-brand-black"
                : "text-brand-gray-400 hover:text-brand-gray-600"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active underline */}
      {activeRect && (
        <div
          className="absolute bottom-0 h-0.5 rounded-full bg-brand-yellow transition-all duration-200"
          style={{ left: activeRect.left, width: activeRect.width }}
        />
      )}
    </div>
  );
}
