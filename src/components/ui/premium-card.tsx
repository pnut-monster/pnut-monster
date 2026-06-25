import { motion } from "framer-motion";
import { cn } from "@/lib/utils/helpers";
import { ReactNode } from "react";

interface PremiumCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "gradient" | "glass" | "shine" | "elevated";
  hoverEffect?: boolean;
  delay?: number;
}

export function PremiumCard({
  children,
  className,
  variant = "default",
  hoverEffect = true,
  delay = 0,
}: PremiumCardProps) {
  const variants = {
    default: "bg-white border border-brand-gray-100",
    gradient: "bg-gradient-to-br from-white via-brand-cream/30 to-brand-yellow/5 border border-brand-yellow/20",
    glass: "bg-white/60 backdrop-blur-xl border border-white/20 shadow-xl",
    shine: "relative bg-white border border-brand-gray-100 overflow-hidden",
    elevated: "bg-white border-2 border-brand-gray-100 shadow-2xl",
  };

  return (
    <motion.div
      className={cn(
        "rounded-3xl transition-all duration-300",
        variants[variant],
        hoverEffect && "hover:shadow-2xl hover:-translate-y-1",
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      whileHover={hoverEffect ? { scale: 1.01 } : {}}
    >
      {variant === "shine" && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "200%" }}
          transition={{
            repeat: Infinity,
            duration: 3,
            ease: "linear",
            repeatDelay: 5,
          }}
        />
      )}
      {children}
    </motion.div>
  );
}
