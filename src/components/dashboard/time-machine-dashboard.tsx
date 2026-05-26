"use client";

import { useMemo, useState } from "react";
import { Clock } from "lucide-react";

import { BoardCard } from "@/components/dashboard/board-card";
import { MonthCategoryCard } from "@/components/dashboard/month-category-card";
import { MonthNavigator } from "@/components/dashboard/month-navigator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  buildBoardData,
  BOARDS,
  type AccountRow,
  type RecurringRow,
  type TransactionRow,
} from "@/lib/dashboard";
import type { BudgetCategory } from "@/lib/system-settings";

interface Props {
  accounts: AccountRow[];
  recurring: RecurringRow[];
  transactions: TransactionRow[];
  /** 各分類本月預算上限，圓餅圖 legend 拿來畫進度條。 */
  budgets: Partial<Record<BudgetCategory, number>>;
}

/**
 * 「歷史時光機」wrapper：把三大板塊 + 圓餅圖綁在同一個 selectedDate 上。
 *
 * 設計選擇：用 client state 而非 URL searchParam，因為 transactions table
 * 已經整批 server-side fetch 過了，月份切換純粹是 in-memory recompute（useMemo），
 * 切換瞬間完成、不需要 loading state。
 *
 * 未來預測（forecast）刻意不在這個 wrapper 內 — 它在 page.tsx 仍然走真實
 * now，跟使用者切到歷史月份完全脫鉤。
 */
export function TimeMachineDashboard({
  accounts,
  recurring,
  transactions,
  budgets,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  // buildBoardData 拿 selectedDate 當作 "now"：metrics 走該月、明細走該月、
  // overdue upcoming 的判斷仍以 selectedDate 為基準（合理：歷史月份不會有 overdue）。
  const boardData = useMemo(
    () => buildBoardData({ accounts, recurring, transactions, now: selectedDate }),
    [accounts, recurring, transactions, selectedDate]
  );

  return (
    <>
      {/* 月份切換器 — 視覺上跟三大板塊綁在一起，讓「我在看哪個月」很明確 */}
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

      {/* 三大板塊 — Desktop */}
      <section
        aria-label="三大財務板塊"
        className="hidden grid-cols-1 gap-4 md:grid lg:grid-cols-3"
      >
        {BOARDS.map((b) => (
          <BoardCard
            key={b.key}
            data={boardData[b.key]}
            allAccounts={accounts}
          />
        ))}
      </section>

      {/* 三大板塊 — Mobile */}
      <section aria-label="三大財務板塊（手機版）" className="md:hidden">
        <Tabs defaultValue="family" className="gap-6">
          <TabsList className="mb-2 grid w-full grid-cols-3">
            {BOARDS.map((b) => (
              <TabsTrigger key={b.key} value={b.key} className="gap-1.5">
                <span aria-hidden>{b.emoji}</span>
                <span>
                  {b.key === "family"
                    ? "家庭"
                    : b.key === "subsidy"
                      ? "補助"
                      : "個人"}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {BOARDS.map((b) => (
            <TabsContent key={b.key} value={b.key}>
              <BoardCard data={boardData[b.key]} allAccounts={accounts} />
            </TabsContent>
          ))}
        </Tabs>
      </section>

      {/* 本月花費分類 — 同樣綁 selectedDate */}
      <MonthCategoryCard
        transactions={transactions}
        accounts={accounts}
        now={selectedDate}
        budgets={budgets}
      />
    </>
  );
}
