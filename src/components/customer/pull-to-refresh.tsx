"use client";

import { useCallback, useRef, useState } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Loader2 } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => void | Promise<void>;
  children: React.ReactNode;
  threshold?: number;
}

export function PullToRefresh({
  onRefresh,
  children,
  threshold = 80,
}: PullToRefreshProps) {
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pulling = useRef(false);

  const pullDistance = useMotionValue(0);
  const spinnerOpacity = useTransform(pullDistance, [0, threshold * 0.5, threshold], [0, 0.5, 1]);
  const spinnerScale = useTransform(pullDistance, [0, threshold], [0.5, 1]);

  const isAtTop = useCallback(() => {
    if (!containerRef.current) return false;
    // Check if the scrollable parent is at top
    let el: HTMLElement | null = containerRef.current;
    while (el) {
      if (el.scrollTop > 0) return false;
      el = el.parentElement;
    }
    return window.scrollY <= 0;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return;
      if (isAtTop()) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    },
    [refreshing, isAtTop]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling.current || refreshing) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;

      if (diff > 0) {
        // Apply resistance: the further you pull, the harder it gets
        const dampened = Math.min(diff * 0.4, threshold * 1.5);
        pullDistance.set(dampened);
      }
    },
    [refreshing, pullDistance, threshold]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    const currentPull = pullDistance.get();

    if (currentPull >= threshold && !refreshing) {
      setRefreshing(true);
      pullDistance.set(threshold * 0.6);

      try {
        await onRefresh();
      } catch (err) {
        console.error("Pull to refresh error:", err);
      } finally {
        setRefreshing(false);
        pullDistance.set(0);
      }
    } else {
      pullDistance.set(0);
    }
  }, [pullDistance, threshold, refreshing, onRefresh]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {/* Pull indicator */}
      <motion.div
        style={{ opacity: spinnerOpacity, scale: spinnerScale }}
        className="absolute left-1/2 -translate-x-1/2 top-2 z-40 flex items-center justify-center"
      >
        <div className="h-10 w-10 rounded-full bg-white shadow-lg border border-brand-gray-100 flex items-center justify-center">
          <Loader2
            className={`h-5 w-5 text-brand-yellow ${refreshing ? "animate-spin" : ""}`}
          />
        </div>
      </motion.div>

      {/* Content with pull offset */}
      <motion.div style={{ y: pullDistance }}>
        {children}
      </motion.div>
    </div>
  );
}
