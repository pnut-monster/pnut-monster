import { type InputHTMLAttributes, type ReactNode, forwardRef } from "react";
import { cn } from "@/lib/utils/helpers";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-semibold text-brand-gray-700"
          >
            {label}
          </label>
        )}
        <div className="relative" suppressHydrationWarning>
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-400 pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            aria-describedby={error && inputId ? `${inputId}-error` : undefined}
            suppressHydrationWarning
            className={cn(
              "w-full rounded-xl border bg-white px-4 py-2.5 text-base text-brand-black placeholder:text-brand-gray-400 transition-colors duration-150",
              "focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow",
              error
                ? "border-brand-red focus:ring-brand-red focus:border-brand-red"
                : "border-brand-gray-300",
              icon && "pl-10",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p
            id={inputId ? `${inputId}-error` : undefined}
            className="text-sm text-brand-red"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
