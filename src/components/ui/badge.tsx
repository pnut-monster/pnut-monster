import { cn } from "@/lib/utils/helpers";
import type { ReactNode } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-brand-gray-100 text-brand-gray-700",
  success: "bg-green-100 text-brand-green-dark",
  warning: "bg-yellow-100 text-brand-yellow-dark",
  danger: "bg-red-100 text-brand-red",
  info: "bg-blue-100 text-blue-700",
};

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
