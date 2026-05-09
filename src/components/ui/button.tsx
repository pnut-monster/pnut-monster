import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils/helpers";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark active:bg-brand-yellow-dark focus-visible:ring-brand-yellow",
  secondary:
    "bg-brand-black text-white hover:bg-brand-gray-800 active:bg-brand-gray-700 focus-visible:ring-brand-black",
  outline:
    "border-2 border-brand-black text-brand-black bg-transparent hover:bg-brand-gray-50 active:bg-brand-gray-100 focus-visible:ring-brand-black",
  ghost:
    "text-brand-black bg-transparent hover:bg-brand-gray-100 active:bg-brand-gray-200 focus-visible:ring-brand-gray-400",
  danger:
    "bg-brand-red text-white hover:bg-red-600 active:bg-red-700 focus-visible:ring-brand-red",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5",
  md: "px-5 py-2.5 text-base gap-2",
  lg: "px-7 py-3.5 text-lg gap-2.5",
};

const spinnerVariantColor: Record<ButtonVariant, string> = {
  primary: "text-brand-black",
  secondary: "text-white",
  outline: "text-brand-black",
  ghost: "text-brand-black",
  danger: "text-white",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-bold font-[family-name:var(--font-heading)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading && (
          <Spinner size="sm" className={spinnerVariantColor[variant]} />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
