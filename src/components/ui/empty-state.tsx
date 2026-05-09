import { type ReactNode } from "react";
import { cn } from "@/lib/utils/helpers";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-6 text-center", className)}>
      {icon && (
        <div className="mb-4 text-brand-gray-300">{icon}</div>
      )}
      <h3 className="text-lg font-bold font-[family-name:var(--font-heading)] text-brand-black">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 text-sm text-brand-gray-500 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
