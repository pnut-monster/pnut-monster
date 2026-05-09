"use client";

import { motion } from "framer-motion";
import { Plus, Check } from "lucide-react";
import { useState } from "react";

interface AnimatedAddButtonProps {
  onAdd: () => void;
  price?: string;
  className?: string;
}

export function AnimatedAddButton({ onAdd, price, className = "" }: AnimatedAddButtonProps) {
  const [added, setAdded] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAdded(true);
    onAdd();
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <motion.button
      onClick={handleClick}
      whileTap={{ scale: 0.9 }}
      className={`relative flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
        added
          ? "bg-brand-green text-white"
          : "bg-brand-yellow/10 text-brand-yellow-dark"
      } ${className}`}
    >
      <motion.span
        key={added ? "check" : "plus"}
        initial={{ scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
      >
        {added ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
      </motion.span>
      {added ? "ADDED" : price ? `ADD ${price}` : "ADD"}
    </motion.button>
  );
}
