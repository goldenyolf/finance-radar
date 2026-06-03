/**
 * 收入多維度分類 — labels / Apple 風 4 色 palette / 月度 aggregation helper。
 *
 * 跟 expense-categories.ts 平行的「對 income 維度」工具集。
 * 配對 0017 migration 新欄位 transactions.income_category。
 */

import { num, type IncomeCategory, type TransactionRow } from "@/lib/dashboard";

/* ─────────────────── Labels ─────────────────── */

export const INCOME_CATEGORY_LABEL: Record<IncomeCategory, string> = {
  salary: "主業薪資",
  side_hustle: "副業外快",
  investment: "投資配息",
  other: "其他流入",
};

/* ─────────────────── 配色 ─────────────────── */

/**
 * Apple 風 4 色 palette — 暗黑背景下飽和度足夠 + 互相區隔明顯。
 *   salary       深藍 (blue-500)       — 穩定主業
 *   side_hustle  翡翠綠 (emerald-500)   — 自由副業 / 跟全站「正向」綠呼應
 *   investment   琥珀黃 (amber-500)     — 配息 / 利息「金光」語意
 *   other        zinc neutral          — 補助 / 退稅 / 紅包 — 中性
 */
export const INCOME_CATEGORY_COLOR: Record<IncomeCategory, string> = {
  salary: "#3B82F6",      // blue-500
  side_hustle: "#10B981", // emerald-500
  investment: "#F59E0B",  // amber-500
  other: "#71717A",       // zinc-500
};

/* ─────────────────── Slice 結構 + Aggregation ─────────────────── */

export interface IncomeCategorySlice {
  category: IncomeCategory;
  label: string;
  amount: number;
  color: string;
}

/**
 * 把 transactions 攤平成 month-scoped 的 IncomeCategorySlice 陣列。
 *
 * 過濾條件：
 *   - type === 'income'
 *   - status === 'completed'（跟其他月度聚合一致；upcoming 不算實際入帳）
 *   - date 落在 monthDate 同月
 *
 * income_category=null（歷史資料 / 不知道分類）→ 落到 'other' bucket（per
 * LLM prompt 規則 E fallback）。
 *
 * 回傳依 amount DESC 排序，0 金額 slice 過濾掉（UI 不渲染空 wedge）。
 */
export function aggregateMonthlyByIncomeCategory(
  transactions: TransactionRow[],
  monthDate: Date
): IncomeCategorySlice[] {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();

  const sums: Record<IncomeCategory, number> = {
    salary: 0,
    side_hustle: 0,
    investment: 0,
    other: 0,
  };

  for (const t of transactions) {
    if (t.type !== "income") continue;
    if (t.status !== "completed") continue;
    if (!t.date) continue;
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getFullYear() !== y || d.getMonth() !== m) continue;

    const amount = num(t.amount);
    if (amount <= 0) continue;

    const cat = (t.income_category ?? "other") as IncomeCategory;
    sums[cat] += amount;
  }

  const slices: IncomeCategorySlice[] = (
    ["salary", "side_hustle", "investment", "other"] satisfies IncomeCategory[]
  )
    .map((cat) => ({
      category: cat,
      label: INCOME_CATEGORY_LABEL[cat],
      amount: sums[cat],
      color: INCOME_CATEGORY_COLOR[cat],
    }))
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return slices;
}
