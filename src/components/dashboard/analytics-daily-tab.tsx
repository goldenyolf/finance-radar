"use client";

import { useMemo, useState } from "react";
import { BarChart3, CalendarDays } from "lucide-react";

import { DailyDetailSection } from "@/components/dashboard/daily-detail-section";
import { DailySpendChart } from "@/components/dashboard/daily-spend-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryRow } from "@/lib/categories";
import { buildDailySpendData } from "@/lib/daily-spend";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";

interface Props {
  transactions: TransactionRow[];
  accounts: AccountRow[];
  categories: CategoryRow[];
}

function todayIsoTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * 單日透視 tab：DatePicker + 堆疊柱狀圖 + 每日分類帳本。
 *
 * 唯一 source of truth = selectedDate (ISO "YYYY-MM-DD" 字串)。
 * 雙向綁定：
 *   - DatePicker change → setSelectedDate → 柱狀圖高亮 + 細項清單刷新
 *   - 柱狀圖點擊      → setSelectedDate → DatePicker value 同步顯示
 *
 * monthDate（柱狀圖該渲染哪個月）從 selectedDate 自動 derive — 使用者用
 * picker 跳到 4 月某天，柱狀圖會自動切到 4 月份的逐日 breakdown，不用
 * 額外 month state。
 *
 * 預設 today（Taipei 時區）— 跟原本 QuickAddTransaction 同邏輯。
 */
export function AnalyticsDailyTab({
  transactions,
  accounts,
  categories,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    todayIsoTaipei()
  );

  // 從 selectedDate 取出月份 → 餵 buildDailySpendData
  // 用 "YYYY-MM-01T00:00:00" 安全建 Date，避免 timezone parse 把月份扯壞
  const monthDate = useMemo(() => {
    const [y, m] = selectedDate.split("-");
    if (!y || !m) return new Date();
    return new Date(Number(y), Number(m) - 1, 1);
  }, [selectedDate]);

  const data = useMemo(
    () => buildDailySpendData(transactions, categories, monthDate),
    [transactions, categories, monthDate]
  );

  return (
    <>
      {/*
        頂部 DatePicker — 原生 <input type="date">：
          - 零依賴；mobile iOS/Android 都有 native wheel/spinner UI
          - 桌面點 icon 跳日曆面板，跟整套 design language 一致
          - 不設 min/max → 使用者愛跳到哪一天都行；柱狀圖自動跟著切月份
      */}
      <Card className="mb-6">
        <CardContent className="px-5 py-4">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <Label
              htmlFor="daily-date-picker"
              className="flex items-center gap-1.5 text-sm font-medium"
            >
              <CalendarDays className="size-4 text-muted-foreground" />
              選擇日期
            </Label>
            <Input
              id="daily-date-picker"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-10 max-w-[14rem] tabular-nums sm:ml-auto"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">每日花費透視</CardTitle>
          </div>
          <CardDescription className="mt-1">
            按日堆疊看花最多的那天；點任一柱往下鑽取細項，或用上方日期選擇器跳轉。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DailySpendChart
            data={data}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
          />
        </CardContent>
      </Card>

      <DailyDetailSection
        date={selectedDate}
        transactions={transactions}
        accounts={accounts}
        categories={categories}
      />
    </>
  );
}
