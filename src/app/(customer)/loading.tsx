import { Skeleton } from "@/components/ui/skeleton";

export default function CustomerLoading() {
  return (
    <div className="min-h-screen bg-brand-cream pb-20">
      {/* Header skeleton */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-brand-gray-100 px-4 py-3 safe-top">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </div>
      </div>

      {/* Search bar skeleton */}
      <div className="px-4 mt-4">
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>

      {/* Category chips skeleton */}
      <div className="px-4 mt-4 flex gap-2 overflow-hidden">
        <Skeleton className="h-9 w-20 rounded-full shrink-0" />
        <Skeleton className="h-9 w-24 rounded-full shrink-0" />
        <Skeleton className="h-9 w-16 rounded-full shrink-0" />
        <Skeleton className="h-9 w-28 rounded-full shrink-0" />
        <Skeleton className="h-9 w-20 rounded-full shrink-0" />
      </div>

      {/* Banner skeleton */}
      <div className="px-4 mt-5">
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>

      {/* Section heading skeleton */}
      <div className="px-4 mt-6 flex items-center justify-between">
        <Skeleton className="h-6 w-36 rounded-lg" />
        <Skeleton className="h-5 w-16 rounded-lg" />
      </div>

      {/* Product cards skeleton */}
      <div className="px-4 mt-3 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl overflow-hidden border border-brand-gray-100"
          >
            <Skeleton className="h-28 w-full rounded-none" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
              <div className="flex items-center justify-between pt-1">
                <Skeleton className="h-5 w-12 rounded" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom nav skeleton */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-brand-gray-100 px-2 py-2 safe-bottom">
        <div className="flex justify-around">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Skeleton className="h-6 w-6 rounded" />
              <Skeleton className="h-2.5 w-10 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
