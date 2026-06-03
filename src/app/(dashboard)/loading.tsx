import { Skeleton } from "@/components/ui/skeleton";

/**
 * 首頁 loading：模擬 alert（小機率出現）+ 三大板塊（3 card grid）+ forecast chart
 * 的版面骨架。Next.js 自動在 RSC fetch 中插入此 UI。
 */
export default function HomeLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
      {/* Header */}
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-48 sm:h-10" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex flex-col items-end gap-3">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32 rounded-full" />
            <Skeleton className="h-10 w-32 rounded-full" />
          </div>
        </div>
      </div>

      {/* 三大板塊 grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <BoardCardSkeleton key={i} />
        ))}
      </div>

      {/* Forecast */}
      <Skeleton className="mt-8 h-[400px] w-full" />
    </main>
  );
}

function BoardCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="h-3 w-48" />
      <div className="flex flex-col gap-4">
        {/* 資產整合看板 — headline + divider + 子帳戶 3 列 */}
        <div className="rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10">
          <div className="flex items-baseline justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-28" />
          </div>
          <Skeleton className="mt-2 h-3 w-40" />
          <div className="my-3 border-t border-foreground/10" />
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="size-3 rounded-sm" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10"
          >
            <div className="flex items-baseline justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-24" />
            </div>
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
