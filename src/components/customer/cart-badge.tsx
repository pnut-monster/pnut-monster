"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCartStore } from "@/lib/stores/cart-store";

export function CartBadge() {
  const count = useCartStore((s) => s.getItemCount());

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.span
          key="cart-badge"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-red text-[10px] font-bold text-white"
        >
          {count > 9 ? "9+" : count}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
