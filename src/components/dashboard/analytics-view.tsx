"use client";

import { useMemo, useState } from "react";

import { AnalyticsDailyTab } from "@/components/dashboard/analytics-daily-tab";
import { AnalyticsMonthlyTab } from "@/components/dashboard/analytics-monthly-tab";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { CategoryRow } from "@/lib/categories";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";

interface Props {
  accounts: AccountRow[];
  transactions: TransactionRow[];
  categories?: CategoryRow[];
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
 * 分析頁 Tab 殼 + 跨 tab 共用狀態。
 *
 * 為什麼 selectedDate + tab 要 lift 到這層：
 *   - 月度 tab 的「當月每日花費透視」chart，點任一柱要跳到單日 tab + 該日明細
 *     → chart 的 onDateSelect 必須能同時 setSelectedDate + setTab("daily")
 *   - 從 daily 切回 monthly，chart 也該 highlight 使用者剛剛看過的那天
 *     → 視覺連續性，不會丟失 context
 *
 * 兩個 tab 各自還是有自己的 local state（monthly 有 monthDate；daily 有 navigator
 * 動作），這層只 own 跨 tab 必須共享的東西。
 */
export function AnalyticsView({
  accounts,
  transactions,
  categories,
}: Props) {
  const today = useMemo(() => todayIsoTaipei(), []);
  const [tab, setTab] = useState<string>("monthly");
  const [selectedDate, setSelectedDate] = useState<string>(() => today);

  function handleDrillDownToDay(iso: string) {
    setSelectedDate(iso);
    setTab("daily");
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-6">
      <TabsList className="grid w-full max-w-md grid-cols-2 sm:max-w-sm">
        <TabsTrigger value="monthly" className="gap-1.5">
          <span aria-hidden>📅</span>
          月度總覽
        </TabsTrigger>
        <TabsTrigger value="daily" className="gap-1.5">
          <span aria-hidden>🗓️</span>
          單日透視
        </TabsTrigger>
      </TabsList>

      <TabsContent value="monthly">
        <AnalyticsMonthlyTab
          transactions={transactions}
          accounts={accounts}
          categories={categories ?? []}
          selectedDate={selectedDate}
          onDrillDownToDay={handleDrillDownToDay}
        />
      </TabsContent>

      <TabsContent value="daily">
        <AnalyticsDailyTab
          transactions={transactions}
          accounts={accounts}
          categories={categories ?? []}
          selectedDate={selectedDate}
          onSelectedDateChange={setSelectedDate}
          today={today}
        />
      </TabsContent>
    </Tabs>
  );
}
