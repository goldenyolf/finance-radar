"use client";

import { useMemo, useState } from "react";
import { BarChart3, Clock, GitMerge, TrendingUp } from "lucide-react";

import { CashflowSankeyChart } from "@/components/dashboard/cashflow-sankey-chart";
import { CrossMonthTrendChart } from "@/components/dashboard/cross-month-trend-chart";
import { DailySpendChart } from "@/components/dashboard/daily-spend-chart";
import { MonthCategoryCard } from "@/components/dashboard/month-category-card";
import { MonthNavigator } from "@/components/dashboard/month-navigator";
import { TopMerchantsList } from "@/components/dashboard/top-merchants-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryRow } from "@/lib/categories";
import { getCrossMonthTrendData } from "@/lib/cross-month-trend";
import { buildDailySpendData } from "@/lib/daily-spend";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";
import { buildSankeyData } from "@/lib/sankey-data";
import { getTopMerchantsData } from "@/lib/top-merchants";

const MONTH_SWITCH_DELAY_MS = 280;

interface Props {
  transactions: TransactionRow[];
  accounts: AccountRow[];
  categories: CategoryRow[];
  /** AnalyticsView 共用的選中日；用來在柱狀圖標出「使用者剛剛看過的那天」 */
  selectedDate: string;
  /** chart 點某日 → 跳到 daily tab 看該日明細 */
  onDrillDownToDay: (iso: string) => void;
}

/**
 * 月度總覽 tab：MonthNavigator + 桑基圖 + 當月每日花費透視 + 月度分類卡。
 *
 * monthDate state 自包含 — 跟 selectedDate 解耦：
 *   - monthDate 控制 Sankey / Pie 看哪個月
 *   - selectedDate 是「使用者最後 drill 的那天」，跨 tab 用
 *
 * 柱狀圖點擊：只觸發 onDrillDownToDay → 父層 setSelectedDate + setTab("daily")。
 * Monthly 自己這層不維護「當前選哪天」的概念（沒明細區，不需要）。
 */
export function AnalyticsMonthlyTab({
  transactions,
  accounts,
  categories,
  selectedDate,
  onDrillDownToDay,
}: Props) {
  const [monthDate, setMonthDate] = useState<Date>(() => new Date());
  const [isMonthSwitching, setIsMonthSwitching] = useState(false);

  const sankeyData = useMemo(
    () => buildSankeyData(transactions, accounts, monthDate, categories),
    [transactions, accounts, monthDate, categories]
  );

  const dailyData = useMemo(
    () => buildDailySpendData(transactions, categories, monthDate),
    [transactions, categories, monthDate]
  );

  // 近 6 個月趨勢：以 monthDate 為基準往回 6 個月（含當前 monthDate 月）
  // → 使用者切到歷史月份時，趨勢圖也跟著移動視窗，做時光機式 retro 分析
  const trendData = useMemo(
    () => getCrossMonthTrendData(transactions, monthDate),
    [transactions, monthDate]
  );

  const topMerchants = useMemo(
    () => getTopMerchantsData(transactions, monthDate),
    [transactions, monthDate]
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

      {/* 0) 近 6 個月財務趨勢 — 跨月儀表板，最 high-level 的健康度檢查擺第一 */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">📈 近 6 個月財務趨勢</CardTitle>
          </div>
          <CardDescription className="mt-1">
            綠 / 紅長條 = 月度收入 / 支出；藍色折線 = 儲蓄率。
            <span className="text-emerald-700 dark:text-emerald-400">
              {" "}持續維持 20% 以上的儲蓄率
            </span>
            是穩健理財的關鍵。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isMonthSwitching ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <CrossMonthTrendChart data={trendData} />
          )}
        </CardContent>
      </Card>

      {/* 1) 當月每日花費透視 — 最常看的「哪天花最多」daily breakdown */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">當月每日花費透視</CardTitle>
          </div>
          <CardDescription className="mt-1">
            按日堆疊看花最多的那天；點任一柱 → 自動跳到「單日透視」看當天細項。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isMonthSwitching ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <DailySpendChart
              data={dailyData}
              /* 只有當 selectedDate 落在當前月份才高亮，避免「使用者切到 4 月但
                 selectedDate 是 5/15」這種錯亂的視覺 */
              selectedDate={
                selectedDate.startsWith(monthKeyFromDate(monthDate))
                  ? selectedDate
                  : null
              }
              onDateSelect={onDrillDownToDay}
            />
          )}
        </CardContent>
      </Card>

      {/* 2) 本月花費分類 — 圓餅圖 + 分類預算消耗 */}
      {isMonthSwitching ? (
        <Card className="mb-6">
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
        <div className="mb-6">
          <MonthCategoryCard
            transactions={transactions}
            accounts={accounts}
            now={monthDate}
            categories={categories}
          />
        </div>
      )}

      {/* 3) 🧛 吸血鬼排行榜 — 按 merchant 維度看「誰吸最多」，跟上面分類維度互補 */}
      {isMonthSwitching ? (
        <Card className="mb-6">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-3 w-72" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-1 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="mb-6">
          <TopMerchantsList data={topMerchants} />
        </div>
      )}

      {/* 4) 本月現金流向圖 — Sankey 視覺重，擺最下面當 deep-dive */}
      <Card>
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
    </>
  );
}

/** "2026-05" prefix — 拿來比對 selectedDate 是否落在當前 monthDate 的月份內 */
function monthKeyFromDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`;
}
