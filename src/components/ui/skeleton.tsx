import { cn } from "@/lib/utils/helpers";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-brand-gray-200", className)}
      aria-hidden="true"
    />
  );
}
