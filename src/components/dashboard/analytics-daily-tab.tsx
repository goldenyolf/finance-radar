"use client";

import { DailyDetailSection } from "@/components/dashboard/daily-detail-section";
import type { CategoryRow } from "@/lib/categories";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";

interface Props {
  transactions: TransactionRow[];
  accounts: AccountRow[];
  categories: CategoryRow[];
  /** 從 AnalyticsView lift 來的共用日期 — 跟 monthly tab chart 的 highlight 串接 */
  selectedDate: string;
  onSelectedDateChange: (next: string) => void;
  /** Taipei「今天」字串 — 給 navigator 判斷「回到今天」按鈕要不要顯示、> 是否要 disabled */
  today: string;
}

/**
 * 單日透視 tab — 純粹包 DailyDetailSection（自帶日期 navigator）。
 *
 * 為什麼這個 tab 只剩薄薄一層：當月每日花費透視（柱狀圖）已搬到 monthly tab，
 * 邏輯上 chart 屬於「月度看每天」，detail 屬於「單日看細項」。這樣切分後
 * 兩個 tab 各做一件事，視覺資訊密度也降下來。
 *
 * 跨 tab 串接（柱狀圖點擊 → 跳這 tab + 該日明細）由 AnalyticsView 統一管。
 */
export function AnalyticsDailyTab({
  transactions,
  accounts,
  categories,
  selectedDate,
  onSelectedDateChange,
  today,
}: Props) {
  return (
    <DailyDetailSection
      date={selectedDate}
      today={today}
      onDateChange={onSelectedDateChange}
      transactions={transactions}
      accounts={accounts}
      categories={categories}
    />
  );
}
