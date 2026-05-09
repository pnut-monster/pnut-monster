import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-brand-gray-50">
      {/* Top bar skeleton */}
      <div className="sticky top-0 z-30 bg-white border-b border-brand-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-40 rounded-lg" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Page heading skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-8 w-48 rounded-lg" />
            <Skeleton className="h-4 w-64 rounded" />
          </div>
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>

        {/* Stats cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-brand-gray-100 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-7 w-20 rounded mb-1" />
              <Skeleton className="h-4 w-28 rounded" />
            </div>
          ))}
        </div>

        {/* Table / content skeleton */}
        <div className="bg-white rounded-2xl border border-brand-gray-100 overflow-hidden">
          {/* Table header */}
          <div className="px-5 py-4 border-b border-brand-gray-100 flex items-center justify-between">
            <Skeleton className="h-6 w-32 rounded" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>

          {/* Table rows */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="px-5 py-4 border-b border-brand-gray-50 flex items-center gap-4"
            >
              <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3 rounded" />
                <Skeleton className="h-3 w-1/4 rounded" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-5 w-12 rounded" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
