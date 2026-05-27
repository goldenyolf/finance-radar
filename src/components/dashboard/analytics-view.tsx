"use client";

import { useMemo, useState } from "react";
import { Clock, GitMerge } from "lucide-react";

import { CashflowSankeyChart } from "@/components/dashboard/cashflow-sankey-chart";
import { DailySpendSection } from "@/components/dashboard/daily-spend-section";
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

/** 月份切換時短暫顯示 skeleton 的視覺延遲（ms）。 */
const MONTH_SWITCH_DELAY_MS = 280;

interface Props {
  accounts: AccountRow[];
  transactions: TransactionRow[];
  /** 動態 categories — 即時連動 /settings 的顏色 / 名稱 / 預算。 */
  categories?: CategoryRow[];
}

/**
 * 分析頁的時光機 wrapper：管 selectedDate 並把它傳給圓餅圖。
 * 跟 /  首頁刻意分家 — 首頁的 boards 永遠走真實當下，這裡才允許切歷史。
 */
export function AnalyticsView({
  accounts,
  transactions,
  categories,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [isMonthSwitching, setIsMonthSwitching] = useState(false);

  // selectedDate 變動時自動重建 sankey；transactions 上百筆時也只是 ms 等級
  const sankeyData = useMemo(
    () => buildSankeyData(transactions, accounts, selectedDate, categories),
    [transactions, accounts, selectedDate, categories]
  );

  /**
   * 月份切換的「視覺延遲」：因為 useMemo 是同步的，沒有真正的 fetch
   * loading 狀態 — 為了符合 spec 的「切月份顯示 skeleton」polish，
   * 刻意加 ~280ms 視覺延遲，讓 skeleton 有時間 flash。
   *
   * 若未來改成 per-month Supabase fetch，這層 setTimeout 拿掉就好，
   * 整個 skeleton 邏輯不用動。
   */
  function handleMonthChange(next: Date) {
    setIsMonthSwitching(true);
    window.setTimeout(() => {
      setSelectedDate(next);
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
          selectedDate={selectedDate}
          onChange={handleMonthChange}
          disabled={isMonthSwitching}
        />
      </div>

      {/* 桑基圖 — 收入分類 → 帳戶 → 支出分類，當月金流一覽 */}
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
        <Card className="mb-8">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-3 w-72" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
      ) : (
        <DailySpendSection
          transactions={transactions}
          accounts={accounts}
          categories={categories ?? []}
          monthDate={selectedDate}
        />
      )}

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
          now={selectedDate}
          categories={categories}
        />
      )}
    </>
  );
}
