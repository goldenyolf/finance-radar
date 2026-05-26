import { ScrollText } from "lucide-react";

import { PageTransition } from "@/components/dashboard/page-transition";
import { TransactionsView } from "@/components/dashboard/transactions-view";
import { loadDashboard } from "@/lib/load-dashboard";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const { accounts, transactions } = await loadDashboard();
  // SSR 先排序後端拿到的全量，挑前 200 筆當預設清單。client 之後可走 supabase
  // 重撈（搜尋 / 重新整理）。
  const sorted = [...transactions]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 200);

  return (
    <PageTransition>
    <main className="mx-auto w-full max-w-4xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
      <header className="mb-8">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Transactions
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          <ScrollText className="size-7 text-muted-foreground" />
          歷史明細
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          預設顯示最近 200 筆紀錄；輸入關鍵字可跨月份模糊搜尋並自動加總符合的支出。
        </p>
      </header>

      <TransactionsView accounts={accounts} initial={sorted} />
    </main>
    </PageTransition>
  );
}
