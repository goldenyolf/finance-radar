"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";

import { DailyDetailSection } from "@/components/dashboard/daily-detail-section";
import { DailySpendChart } from "@/components/dashboard/daily-spend-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CategoryRow } from "@/lib/categories";
import {
  buildDailySpendData,
  findDefaultSelectedDate,
} from "@/lib/daily-spend";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";

interface Props {
  transactions: TransactionRow[];
  accounts: AccountRow[];
  categories: CategoryRow[];
  /** AnalyticsView 的「歷史時光機」當月日期 — 月份變動會 reset selectedDay */
  monthDate: Date;
}

/**
 * 每日花費透視 + 鑽取清單 — 自包含的小模組，AnalyticsView 直接掛進來即可。
 *
 * 狀態管理：
 *   - data        : useMemo 重算 — 月份/交易/分類任一變動就重 aggregate
 *   - selectedDay : 點圖選的「當天 isoDate」；初值 = findDefaultSelectedDate
 *     (該月有資料的最後一天)；月份變動時自動 reset 成新月份的預設
 *
 * 為什麼 useEffect 只依 monthKey 而不是 data：
 *   transactions 重撈（router.refresh 之類）會讓 data 換 reference，但這時候
 *   不該打斷使用者「我正在看 5/15」的 selection。只有真的切月份才 reset。
 */
export function DailySpendSection({
  transactions,
  accounts,
  categories,
  monthDate,
}: Props) {
  const data = useMemo(
    () => buildDailySpendData(transactions, categories, monthDate),
    [transactions, categories, monthDate]
  );

  const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;

  // 初值 + 月份切換時 reset — 兩個情境一條路
  const [selectedDay, setSelectedDay] = useState<string | null>(() =>
    findDefaultSelectedDate(data.points)
  );

  useEffect(() => {
    setSelectedDay(findDefaultSelectedDate(data.points));
    // 刻意只 deps monthKey：transactions 換 ref 不該打斷使用者選擇
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">每日花費透視</CardTitle>
        </div>
        <CardDescription className="mt-1">
          按日堆疊看花最多的那天；點任一柱往下鑽取當天細項分類。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DailySpendChart
          data={data}
          selectedDate={selectedDay}
          onDateSelect={setSelectedDay}
        />
        <DailyDetailSection
          date={selectedDay}
          transactions={transactions}
          accounts={accounts}
          categories={categories}
        />
      </CardContent>
    </Card>
  );
}
