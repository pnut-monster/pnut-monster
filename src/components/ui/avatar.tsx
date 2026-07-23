"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils/helpers";

type AvatarSize = "sm" | "md" | "lg";

interface AvatarProps {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  className?: string;
}

const sizeStyles: Record<AvatarSize, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({ src, alt, name, size = "md", className }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showFallback = !src || imgError;
  const initials = name ? getInitials(name) : "?";

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-brand-yellow",
        sizeStyles[size],
        className
      )}
      role="img"
      aria-label={alt || name || "Avatar"}
    >
      {showFallback ? (
        <span className="flex h-full w-full items-center justify-center font-bold text-brand-black font-[family-name:var(--font-heading)]">
          {initials}
        </span>
      ) : (
        <Image
          src={src}
          alt={alt || name || "Avatar"}
          fill
          sizes={size === "lg" ? "56px" : size === "md" ? "40px" : "32px"}
          className="object-cover"
          onError={() => setImgError(true)}
          unoptimized
        />
      )}
    </div>
  );
}
