"use client";

import { useEffect } from "react";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-brand-yellow/20">
          <AlertTriangle className="h-10 w-10 text-brand-yellow-dark" />
        </div>

        {/* Heading */}
        <h1 className="font-[family-name:var(--font-heading)] text-3xl text-brand-black mb-3">
          Something went wrong
        </h1>

        {/* Message */}
        <p className="font-[family-name:var(--font-body)] text-brand-gray-500 text-base mb-6 leading-relaxed">
          We hit a bump in the road. Don&apos;t worry, your sprouts are safe!
          Try again or head back home.
        </p>

        {/* Error details in dev */}
        {isDev && error?.message && (
          <div className="mb-6 rounded-xl bg-brand-gray-100 border border-brand-gray-200 p-4 text-left">
            <p className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wide mb-1">
              Error Details
            </p>
            <p className="text-sm text-brand-red font-mono break-words">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-brand-gray-400 mt-2">
                Digest: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-yellow px-6 py-3 font-bold font-[family-name:var(--font-heading)] text-brand-black transition-colors hover:bg-brand-yellow-dark active:bg-brand-yellow-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow focus-visible:ring-offset-2"
          >
            <RotateCcw className="h-5 w-5" />
            Try Again
          </button>

          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-brand-black bg-transparent px-6 py-3 font-bold font-[family-name:var(--font-heading)] text-brand-black transition-colors hover:bg-brand-gray-50 active:bg-brand-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-black focus-visible:ring-offset-2"
          >
            <Home className="h-5 w-5" />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
