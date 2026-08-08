import { PieChart } from "lucide-react";

import { AnalyticsView } from "@/components/dashboard/analytics-view";
import { PageTransition } from "@/components/dashboard/page-transition";
import { initialWindowSince } from "@/lib/analytics-window";
import { loadCategories } from "@/lib/load-categories";
import { loadDashboard } from "@/lib/load-dashboard";
import { loadProfileSettings } from "@/lib/load-profile";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  /*
    只抓最近 13 個月，不再全歷史。

    原本 loadDashboard() 不帶下界 = `select("*")` 全表，而且整份 transactions
    會序列化進 AnalyticsView（"use client"）→ 全部進 RSC payload，每次進頁面
    都重傳，隨資料量無上限成長。

    使用者翻到窗口外的月份時，AnalyticsView 會用 browser client 補抓缺的
    區間（見 analytics-window.ts），歷史瀏覽功能完全保留。
  */
  const transactionsSince = initialWindowSince();

  const [{ accounts, transactions, recurring }, categories, profile] =
    await Promise.all([
      loadDashboard({ transactionsSince }),
      loadCategories(),
      loadProfileSettings(),
    ]);

  return (
    <PageTransition>
    <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
      <header className="mb-8">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Analytics
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          <PieChart className="size-7 text-muted-foreground" />
          分析報表
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          切歷史月份檢視當時的花費結構；有設定預算的分類會顯示消耗進度條。
        </p>
      </header>

      <AnalyticsView
        accounts={accounts}
        transactions={transactions}
        categories={categories}
        targetSavingsRate={profile.target_savings_rate}
        recurring={recurring}
        loadedSince={transactionsSince}
      />
    </main>
    </PageTransition>
  );
}
