"use client";

import { useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff } from "lucide-react";

function subscribeOnlineStatus(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function OfflineIndicator() {
  const isOnline = useSyncExternalStore(subscribeOnlineStatus, getOnlineSnapshot, getServerSnapshot);
  const isOffline = !isOnline;

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[9999] safe-top"
        >
          <div className="bg-brand-orange text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-semibold font-[family-name:var(--font-body)] shadow-lg">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>You&apos;re offline. Some features may not work.</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
