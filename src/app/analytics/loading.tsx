import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
      <div className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-40 sm:h-10" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* 月份切換 bar */}
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-56 rounded-full" />
      </div>

      {/* Sankey 卡片 */}
      <div className="mb-8 flex flex-col gap-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-72" />
        <Skeleton className="h-[460px] w-full" />
      </div>

      {/* 圓餅圖卡片 */}
      <div className="flex flex-col gap-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-9 w-56 rounded-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_260px]">
          <Skeleton className="h-72 w-full" />
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
