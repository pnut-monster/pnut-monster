import { Home, Search } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* 404 number */}
        <p className="font-[family-name:var(--font-heading)] text-8xl font-bold text-brand-yellow mb-2 select-none">
          404
        </p>

        {/* Heading */}
        <h1 className="font-[family-name:var(--font-heading)] text-2xl text-brand-black mb-3">
          Page not found
        </h1>

        {/* Fun message */}
        <p className="font-[family-name:var(--font-body)] text-brand-gray-500 text-base mb-8 leading-relaxed">
          Oops! This sprout ran away! The page you&apos;re looking for
          doesn&apos;t exist or has been moved.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-yellow px-6 py-3 font-bold font-[family-name:var(--font-heading)] text-brand-black transition-colors hover:bg-brand-yellow-dark active:bg-brand-yellow-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow focus-visible:ring-offset-2"
          >
            <Home className="h-5 w-5" />
            Back to Home
          </Link>

          <Link
            href="/search"
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-brand-black bg-transparent px-6 py-3 font-bold font-[family-name:var(--font-heading)] text-brand-black transition-colors hover:bg-brand-gray-50 active:bg-brand-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-black focus-visible:ring-offset-2"
          >
            <Search className="h-5 w-5" />
            Search Menu
          </Link>
        </div>
      </div>
    </div>
  );
}
