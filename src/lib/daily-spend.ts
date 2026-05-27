/**
 * 每日花費透視（Daily Spend Drill-down）— 純資料聚合。
 *
 * 給定當月（由 selectedMonth 決定）所有 transactions + categories，輸出：
 *   - points  : Recharts <BarChart> 直接吃的 time-series 陣列；每點同時帶
 *               total（Y 軸總和）+ 動態分類 keys（每根 <Bar> 對應一個 stack）
 *   - series  : 當月實際出現過的分類清單（含 color），給 caller 動態 .map
 *               生 <Bar dataKey={name} fill={color} />。把 series 跟 points
 *               解耦的好處：UI 不用自己 derive「有哪些分類存在」。
 *
 * 過濾規則：
 *   - type === "expense"（income / transfer 不該出現在「花費透視」）
 *   - status === "completed"（upcoming 是未來預計，不是已發生）
 *
 * 日期處理：transactions.date 是 "YYYY-MM-DD" 字串，直接字串比對最穩，
 * 不走 new Date() 避免 timezone parsing 噩夢。
 */

import { getAccountLabel } from "@/lib/account-display";
import type { CategoryRow } from "@/lib/categories";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/expense-categories";
import { num, type AccountRow, type TransactionRow } from "@/lib/dashboard";

/** 月內某一天的聚合點。dynamic key = 分類名 → 該日該分類總額（number）。 */
export type DailySpendPoint = {
  /** X 軸顯示 "5/1" */
  label: string;
  /** "2026-05-01" — selectedDate 比對 + 點擊事件 payload */
  isoDate: string;
  /** Y 軸總和（給 reference / tooltip） */
  total: number;
} & {
  // 動態分類欄位：每筆 categoryName → 金額（number）。Recharts 直接吃 dataKey={name}
  [categoryName: string]: number | string;
};

export interface DailySpendSeries {
  name: string;
  color: string;
  /** 該分類於該月的累積總額 — UI 可拿來排序（最大宗的 stack 在最下層） */
  monthTotal: number;
}

export interface DailySpendData {
  points: DailySpendPoint[];
  series: DailySpendSeries[];
}

/* ─────────────────────────── helpers ─────────────────────────── */

const FALLBACK_COLOR = "#94A3B8"; // slate-400 — 未知分類兜底

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 給定年月，生出該月每一天的 "YYYY-MM-DD" 字串清單。31/30/28 都對。 */
function enumerateMonthDays(year: number, monthIndex: number): string[] {
  // monthIndex 0-based; new Date(y, m+1, 0).getDate() = 該月最後一天
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const ym = `${year}-${pad2(monthIndex + 1)}`;
  return Array.from({ length: daysInMonth }, (_, i) => `${ym}-${pad2(i + 1)}`);
}

/**
 * 把 transactions.category（snake_case code 或 null）解析成顯示用 (name, color)。
 * 三段 fallback：
 *   1) 動態 categories.byCode 命中（user-defined or seed） — 用使用者設定值
 *   2) 靜態 EXPENSE_CATEGORY_LABEL 命中（舊資料 code 沒被 seed 進 categories）
 *   3) 'other' / 完全沒命中 — 統一歸到「其他」，避免 chart 爆出無名 stack
 */
interface ResolvedCategory {
  name: string;
  color: string;
}

function resolveCategory(
  code: string | null,
  byCode: Map<string, CategoryRow>
): ResolvedCategory {
  if (code) {
    const dyn = byCode.get(code);
    if (dyn) return { name: dyn.name, color: dyn.color };
    const staticName = EXPENSE_CATEGORY_LABEL[code as keyof typeof EXPENSE_CATEGORY_LABEL];
    if (staticName) return { name: staticName, color: FALLBACK_COLOR };
  }
  return { name: "其他", color: FALLBACK_COLOR };
}

/* ─────────────────────────── main API ─────────────────────────── */

/**
 * 主聚合函式。selectedMonth 只用到 year / monthIndex，傳 new Date() 就 OK。
 *
 * 沒任何符合條件的 transaction → 仍回所有日期 (total=0)，series 空陣列。
 * 圖表就顯示 31 根 0 高度的柱，drill-down 區會走 empty state。
 */
export function buildDailySpendData(
  transactions: TransactionRow[],
  categories: CategoryRow[],
  selectedMonth: Date
): DailySpendData {
  const year = selectedMonth.getFullYear();
  const monthIndex = selectedMonth.getMonth();
  const monthPrefix = `${year}-${pad2(monthIndex + 1)}-`;

  // categories.byCode 查表 — 避免每筆 transaction 都跑 .find()
  const byCode = new Map<string, CategoryRow>();
  for (const c of categories) {
    if (c.code) byCode.set(c.code, c);
  }

  // (1) 篩當月 + expense + completed
  const monthlyExpenses = transactions.filter(
    (t) =>
      t.type === "expense" &&
      t.status === "completed" &&
      typeof t.date === "string" &&
      t.date.startsWith(monthPrefix)
  );

  // (2) 兩層 group: isoDate → categoryName → sum
  const dayMap = new Map<string, Map<string, number>>();
  const seriesAgg = new Map<string, { color: string; monthTotal: number }>();

  for (const t of monthlyExpenses) {
    const { name, color } = resolveCategory(t.category, byCode);
    const amount = num(t.amount);
    if (amount <= 0) continue;

    let perDay = dayMap.get(t.date);
    if (!perDay) {
      perDay = new Map();
      dayMap.set(t.date, perDay);
    }
    perDay.set(name, (perDay.get(name) ?? 0) + amount);

    const cur = seriesAgg.get(name);
    if (cur) {
      cur.monthTotal += amount;
    } else {
      seriesAgg.set(name, { color, monthTotal: amount });
    }
  }

  // (3) 把所有月份天數展開（含沒花費的日子，total=0）
  const allDays = enumerateMonthDays(year, monthIndex);
  const points: DailySpendPoint[] = allDays.map((isoDate) => {
    const [, mm, dd] = isoDate.split("-");
    const point: DailySpendPoint = {
      label: `${Number(mm)}/${Number(dd)}`, // "5/1" 不補零，X 軸窄
      isoDate,
      total: 0,
    };
    const perDay = dayMap.get(isoDate);
    if (perDay) {
      for (const [name, amount] of perDay) {
        point[name] = amount;
        point.total += amount;
      }
    }
    return point;
  });

  // (4) series 按 monthTotal DESC — 最大宗排在前，Recharts stack 由上往下視覺重
  const series: DailySpendSeries[] = Array.from(seriesAgg.entries())
    .map(([name, v]) => ({ name, color: v.color, monthTotal: v.monthTotal }))
    .sort((a, b) => b.monthTotal - a.monthTotal);

  return { points, series };
}

/**
 * 找預設 selectedDate：當月有資料的「最後一天」（total > 0）。
 * 沒任何花費 → null（caller fallback 顯示「整個月都沒花錢」empty）。
 *
 * points 預期是 ASC by isoDate（buildDailySpendData 保證），所以從尾掃。
 */
export function findDefaultSelectedDate(
  points: DailySpendPoint[]
): string | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].total > 0) return points[i].isoDate;
  }
  return null;
}

/* ─────────────────── Drill-down 鑽取 ─────────────────── */

export interface DailyDetailItem {
  id: string;
  title: string;
  amount: number;
  accountName: string;
}

export interface DailyDetailGroup {
  categoryName: string;
  categoryColor: string;
  total: number;
  items: DailyDetailItem[];
}

export interface DailyDetail {
  isoDate: string;
  total: number;
  /** 按 total DESC — 大宗分類排前面 */
  groups: DailyDetailGroup[];
}

/**
 * 給定某一天，把當天所有 expense（status=completed）按 category 分組。
 * 跟 buildDailySpendData 共用 resolveCategory 邏輯，確保「圖表上某顏色 stack」
 * 跟「下方某分類卡片」是同一個 category。
 *
 * isoDate 預期 "YYYY-MM-DD"。空字串 / 不存在的日期 → groups 為空陣列，
 * total = 0；UI 自己 render empty state。
 */
export function buildDailyDetail(
  transactions: TransactionRow[],
  accounts: AccountRow[],
  categories: CategoryRow[],
  isoDate: string
): DailyDetail {
  if (!isoDate) {
    return { isoDate, total: 0, groups: [] };
  }

  const byCode = new Map<string, CategoryRow>();
  for (const c of categories) {
    if (c.code) byCode.set(c.code, c);
  }
  const accountById = new Map<string, AccountRow>();
  for (const a of accounts) {
    accountById.set(a.id, a);
  }

  // group by categoryName，順便算 total
  const groupMap = new Map<
    string,
    { categoryColor: string; total: number; items: DailyDetailItem[] }
  >();
  let dayTotal = 0;

  for (const t of transactions) {
    if (
      t.type !== "expense" ||
      t.status !== "completed" ||
      t.date !== isoDate
    ) {
      continue;
    }
    const amount = num(t.amount);
    if (amount <= 0) continue;

    const { name, color } = resolveCategory(t.category, byCode);
    const accName = getAccountLabel(
      t.account_id,
      t.account_id ? accountById.get(t.account_id)?.name : undefined
    );

    const item: DailyDetailItem = {
      id: t.id,
      title: t.description?.trim() || "（無說明）",
      amount,
      accountName: accName,
    };

    let g = groupMap.get(name);
    if (!g) {
      g = { categoryColor: color, total: 0, items: [] };
      groupMap.set(name, g);
    }
    g.items.push(item);
    g.total += amount;
    dayTotal += amount;
  }

  const groups: DailyDetailGroup[] = Array.from(groupMap.entries())
    .map(([categoryName, v]) => ({
      categoryName,
      categoryColor: v.categoryColor,
      total: v.total,
      items: v.items.sort((a, b) => b.amount - a.amount), // 組內金額 DESC
    }))
    .sort((a, b) => b.total - a.total); // 組間 total DESC

  return { isoDate, total: dayTotal, groups };
}
