"use client";

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

/**
 * 分析頁兩態切換：
 *   - monthly tab：MonthNavigator + 桑基 + 月度分類卡 → 整月累計視角
 *   - daily tab  ：DatePicker + 堆疊柱狀 + 細項帳本   → 單日鑽取視角
 *
 * 兩個 tab 各自獨立 state（monthDate / selectedDate），互不污染。使用者
 * 來回切 tab 不會洗掉各自的選擇 — 典型 SaaS dashboard 行為。
 *
 * defaultValue="monthly" — 第一次進來看的是「整體狀況」，符合 spec。
 */
export function AnalyticsView({
  accounts,
  transactions,
  categories,
}: Props) {
  return (
    <Tabs defaultValue="monthly" className="gap-6">
      {/*
        TabsList 全寬 + 兩欄等分，行動版觸控面積大；icon + 文字並排視覺
        更鮮明，避免 demo 時誤點。
      */}
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
          categories={categories}
        />
      </TabsContent>

      <TabsContent value="daily">
        <AnalyticsDailyTab
          transactions={transactions}
          accounts={accounts}
          categories={categories ?? []}
        />
      </TabsContent>
    </Tabs>
  );
}
