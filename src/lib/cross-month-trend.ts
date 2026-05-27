/**
 * 跨月收支 + 儲蓄率趨勢聚合 — 純函式，無 React。
 *
 * 用途：「📈 近 6 個月財務趨勢」複合式圖表（Bar 收入/支出 + Line 儲蓄率）。
 *
 * 「6 個月」定義：包含當月在內、往回數 6 個月 = [now-5, ..., now-1, now]。
 * 沒任何交易的月份也會出現在輸出（zero-filled）→ chart X 軸版位不跳。
 *
 * 過濾規則：
 *   - status === "completed"（upcoming 是未來預計，不算實際發生過）
 *   - type 只取 'income' / 'expense'，transfer 跳過（內部轉帳是錢搬位置，
 *     不算真實流量；不該污染「賺多少 / 花多少」這兩個指標）
 */

import { num, type TransactionRow } from "@/lib/dashboard";

export interface CrossMonthTrendPoint {
  /** "2026-01" — 穩定 key，給排序 / 比對 / 跨年判斷用 */
  monthKey: string;
  /** "1月" — X 軸顯示用短標籤 */
  month: string;
  totalIncome: number;
  totalExpense: number;
  /** = totalIncome - totalExpense，可為負（赤字月份） */
  netIncome: number;
  /**
   * 儲蓄率（%）：
   *   - totalIncome > 0 → (netIncome / totalIncome) * 100，1 位小數
   *   - totalIncome === 0 → 0（沒收入時不該回 NaN 或 -Infinity）
   * 可為負（赤字月份折線會跌破 0%）。
   */
  savingsRate: number;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function getCrossMonthTrendData(
  transactions: TransactionRow[],
  now: Date = new Date()
): CrossMonthTrendPoint[] {
  // 1) 生 6 個 monthKey（含當月，最舊 → 最新 ASC）
  const slots: Array<{ key: string; monthOfYear: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    slots.push({
      key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`,
      monthOfYear: d.getMonth() + 1,
    });
  }

  // 2) 初始化每月累加桶
  const buckets = new Map<string, { income: number; expense: number }>();
  for (const s of slots) {
    buckets.set(s.key, { income: 0, expense: 0 });
  }

  // 3) 掃 transactions 累加（只認窗口內、completed、income/expense）
  for (const t of transactions) {
    if (t.status !== "completed") continue;
    if (typeof t.date !== "string") continue;

    const key = t.date.slice(0, 7); // "YYYY-MM"
    const cell = buckets.get(key);
    if (!cell) continue; // 不在 6 個月窗口內

    const amount = num(t.amount);
    if (amount <= 0) continue;

    if (t.type === "income") cell.income += amount;
    else if (t.type === "expense") cell.expense += amount;
    // type === 'transfer' → 跳過（內部轉帳）
  }

  // 4) 輸出 point 陣列；savingsRate 1 位小數
  return slots.map(({ key, monthOfYear }) => {
    const cell = buckets.get(key);
    const totalIncome = cell?.income ?? 0;
    const totalExpense = cell?.expense ?? 0;
    const netIncome = totalIncome - totalExpense;
    const savingsRate =
      totalIncome > 0
        ? Math.round((netIncome / totalIncome) * 1000) / 10
        : 0;

    return {
      monthKey: key,
      month: `${monthOfYear}月`,
      totalIncome,
      totalExpense,
      netIncome,
      savingsRate,
    };
  });
}
