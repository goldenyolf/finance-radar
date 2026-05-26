import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
      <div className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-40 sm:h-10" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* 全域門檻卡片 */}
      <div className="mb-6 flex flex-col gap-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-10 w-64" />
      </div>

      {/* 分類預算卡片 */}
      <div className="flex flex-col gap-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-80" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Skeleton className="h-11 w-28 rounded-full" />
      </div>
    </main>
  );
}
