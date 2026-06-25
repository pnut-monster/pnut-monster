import { motion } from "framer-motion";
import { cn } from "@/lib/utils/helpers";
import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface PremiumButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "gradient" | "glow";
  size?: "sm" | "md" | "lg" | "xl";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
  fullWidth?: boolean;
}

export function PremiumButton({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  className,
  type = "button",
  fullWidth = false,
}: PremiumButtonProps) {
  const variants = {
    primary: "bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark shadow-lg hover:shadow-2xl",
    secondary: "bg-white text-brand-black border-2 border-brand-gray-200 hover:border-brand-yellow shadow-md hover:shadow-xl",
    ghost: "bg-transparent text-brand-black hover:bg-brand-gray-100",
    gradient: "bg-gradient-to-r from-brand-yellow via-brand-orange to-brand-yellow-light text-brand-black shadow-xl hover:shadow-2xl relative overflow-hidden",
    glow: "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 text-white shadow-2xl hover:shadow-purple-500/50 relative overflow-hidden",
  };

  const sizes = {
    sm: "px-4 py-2 text-sm rounded-xl",
    md: "px-6 py-3 text-sm rounded-2xl",
    lg: "px-8 py-4 text-base rounded-2xl",
    xl: "px-10 py-5 text-lg rounded-3xl",
  };

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "font-bold transition-all duration-300 relative",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        (disabled || loading) && "opacity-50 cursor-not-allowed",
        className
      )}
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
    >
      {/* Shine effect for gradient variants */}
      {(variant === "gradient" || variant === "glow") && !disabled && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "200%" }}
          transition={{
            repeat: Infinity,
            duration: 2,
            ease: "linear",
            repeatDelay: 3,
          }}
        />
      )}

      <span className="relative z-10 flex items-center justify-center gap-2">
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </span>
    </motion.button>
  );
}
