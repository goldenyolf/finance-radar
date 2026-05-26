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
import type { AccountRow, TransactionRow } from "@/lib/dashboard";
import { buildSankeyData } from "@/lib/sankey-data";
import type { BudgetCategory } from "@/lib/system-settings";

interface Props {
  accounts: AccountRow[];
  transactions: TransactionRow[];
  budgets: Partial<Record<BudgetCategory, number>>;
}

/**
 * 分析頁的時光機 wrapper：管 selectedDate 並把它傳給圓餅圖。
 * 跟 /  首頁刻意分家 — 首頁的 boards 永遠走真實當下，這裡才允許切歷史。
 */
export function AnalyticsView({ accounts, transactions, budgets }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  // selectedDate 變動時自動重建 sankey；transactions 上百筆時也只是 ms 等級
  const sankeyData = useMemo(
    () => buildSankeyData(transactions, accounts, selectedDate),
    [transactions, accounts, selectedDate]
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          <Clock className="size-3.5" />
          歷史時光機
        </div>
        <MonthNavigator
          selectedDate={selectedDate}
          onChange={setSelectedDate}
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
          <CashflowSankeyChart data={sankeyData} />
        </CardContent>
      </Card>

      <MonthCategoryCard
        transactions={transactions}
        accounts={accounts}
        now={selectedDate}
        budgets={budgets}
      />
    </>
  );
}
