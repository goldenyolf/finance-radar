import { PieChart } from "lucide-react";

import { AnalyticsView } from "@/components/dashboard/analytics-view";
import { PageTransition } from "@/components/dashboard/page-transition";
import { loadDashboard } from "@/lib/load-dashboard";
import { loadSystemSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [{ accounts, transactions }, settings] = await Promise.all([
    loadDashboard(),
    loadSystemSettings(),
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
        budgets={settings.budgets}
      />
    </main>
    </PageTransition>
  );
}
