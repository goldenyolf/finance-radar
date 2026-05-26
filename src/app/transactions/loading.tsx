import { Skeleton } from "@/components/ui/skeleton";

export default function TransactionsLoading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
      <div className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-40 sm:h-10" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Search input */}
      <Skeleton className="mb-4 h-11 w-full" />

      {/* 10 rows */}
      <div className="flex flex-col gap-1">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-md px-2 py-2"
          >
            <Skeleton className="mt-1 h-3 w-20" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </main>
  );
}
