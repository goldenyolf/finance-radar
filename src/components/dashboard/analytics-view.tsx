"use client";

import { useState } from "react";
import { Clock } from "lucide-react";

import { MonthCategoryCard } from "@/components/dashboard/month-category-card";
import { MonthNavigator } from "@/components/dashboard/month-navigator";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";
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

      <MonthCategoryCard
        transactions={transactions}
        accounts={accounts}
        now={selectedDate}
        budgets={budgets}
      />
    </>
  );
}
