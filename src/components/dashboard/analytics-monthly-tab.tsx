"use client";

import { useMemo, useState } from "react";
import { Clock, GitMerge } from "lucide-react";

import { CashflowSankeyChart } from "@/components/dashboard/cashflow-sankey-chart";
import { MonthCategoryCard } from "@/components/dashboard/month-category-card";
import { MonthNavigator } from "@/components/dashboard/month-navigator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryRow } from "@/lib/categories";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";
import { buildSankeyData } from "@/lib/sankey-data";

/** 月份切換時短暫顯示 skeleton 的視覺延遲（ms）— 跟原本同款 */
const MONTH_SWITCH_DELAY_MS = 280;

interface Props {
  transactions: TransactionRow[];
  accounts: AccountRow[];
  categories?: CategoryRow[];
}

/**
 * 月度總覽 tab：MonthNavigator + 桑基圖 + 月度分類卡。
 *
 * 自包含 monthDate state — 跟 DailyTab 完全獨立，使用者切 tab 各自的選擇
 * 都不會被洗掉（典型 SaaS dashboard 行為）。
 */
export function AnalyticsMonthlyTab({
  transactions,
  accounts,
  categories,
}: Props) {
  const [monthDate, setMonthDate] = useState<Date>(() => new Date());
  const [isMonthSwitching, setIsMonthSwitching] = useState(false);

  const sankeyData = useMemo(
    () => buildSankeyData(transactions, accounts, monthDate, categories),
    [transactions, accounts, monthDate, categories]
  );

  function handleMonthChange(next: Date) {
    setIsMonthSwitching(true);
    window.setTimeout(() => {
      setMonthDate(next);
      setIsMonthSwitching(false);
    }, MONTH_SWITCH_DELAY_MS);
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          <Clock className="size-3.5" />
          歷史時光機
        </div>
        <MonthNavigator
          selectedDate={monthDate}
          onChange={handleMonthChange}
          disabled={isMonthSwitching}
        />
      </div>

      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">本月現金流向圖</CardTitle>
          </div>
          <CardDescription className="mt-1">
            從收入來源流入帳戶、再分流到各花費分類，連線粗細代表金額大小。手機請橫向滑動檢視。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isMonthSwitching ? (
            <Skeleton className="h-[460px] w-full" />
          ) : (
            <CashflowSankeyChart data={sankeyData} />
          )}
        </CardContent>
      </Card>

      {isMonthSwitching ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-3 w-72" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_260px]">
              <Skeleton className="h-72 w-full" />
              <div className="flex flex-col gap-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <MonthCategoryCard
          transactions={transactions}
          accounts={accounts}
          now={monthDate}
          categories={categories}
        />
      )}
    </>
  );
}
