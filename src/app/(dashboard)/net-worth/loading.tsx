import { Skeleton } from "@/components/ui/skeleton";

export default function NetWorthLoading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
      <div className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-48 sm:h-10" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* 三大數據卡骨架 — Phase 3 對齊 */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>

      {/* 淨資產趨勢圖骨架 */}
      <Skeleton className="h-72 w-full rounded-xl" />
    </main>
  );
}
