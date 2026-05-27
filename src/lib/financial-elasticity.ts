/**
 * 財務彈性分析 — 固定 vs 浮動支出，純函式無 React。
 *
 * 核心指標：「財務硬性負擔率」(burdenRate) = (fixedExpense / totalIncome) * 100
 *   - <30%   : 安全 — 收入大部分還能自由分配
 *   - 30-60% : 觀望 — 可控但要小心新增固定扣款
 *   - >60%   : 警戒 — 一發薪水就被綁死六成以上，極度沒彈性
 *
 * 「固定」的定義依 categories.is_fixed flag（DB 端 4 個 seed code 預設 true）。
 * income transaction 沒有 category，直接全部加總當分母。
 *
 * 過濾規則：當月、status='completed'（跟其他月度聚合一致；upcoming 不算實際收支）。
 */

import type { CategoryRow } from "@/lib/categories";
import { num, type TransactionRow } from "@/lib/dashboard";

export type ElasticityTier = "safe" | "watch" | "alert";

export interface FinancialElasticityData {
  totalIncome: number;
  fixedExpense: number;
  variableExpense: number;
  /** = fixed + variable，方便 UI 算「固定占總支出」之類副指標 */
  totalExpense: number;
  /**
   * 硬性負擔率（%）。
   * null 表示無收入但有固定支出 → 無限大，UI 應顯示 ∞ 並走 alert tier；
   * 或無收入無支出 → 平靜，走 safe tier。Tier 已由 buildElasticity 計算。
   */
  burdenRate: number | null;
  tier: ElasticityTier;
}

const THRESHOLD_SAFE = 30;
const THRESHOLD_ALERT = 60;

function classifyTier(
  burdenRate: number | null,
  fixedExpense: number
): ElasticityTier {
  // 無收入特例：有固定支出 → alert（無限大負擔）；沒固定支出 → safe（無事發生）
  if (burdenRate === null) {
    return fixedExpense > 0 ? "alert" : "safe";
  }
  if (burdenRate < THRESHOLD_SAFE) return "safe";
  if (burdenRate <= THRESHOLD_ALERT) return "watch";
  return "alert";
}

export function buildFinancialElasticity(
  transactions: TransactionRow[],
  categories: CategoryRow[],
  now: Date = new Date()
): FinancialElasticityData {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthPrefix = `${year}-${month}-`;

  // categories.byCode → is_fixed 查表（避免每筆 transaction 跑 .find）
  const isFixedByCode = new Map<string, boolean>();
  for (const c of categories) {
    if (c.code) isFixedByCode.set(c.code, c.is_fixed);
  }

  let totalIncome = 0;
  let fixedExpense = 0;
  let variableExpense = 0;

  for (const t of transactions) {
    if (t.status !== "completed") continue;
    if (typeof t.date !== "string" || !t.date.startsWith(monthPrefix)) continue;

    const amount = num(t.amount);
    if (amount <= 0) continue;

    if (t.type === "income") {
      totalIncome += amount;
      continue;
    }
    if (t.type !== "expense") continue; // transfer skip

    // category 可能是 code（snake_case）或 null。未知 / null → 視為浮動。
    const isFixed = t.category ? (isFixedByCode.get(t.category) ?? false) : false;
    if (isFixed) fixedExpense += amount;
    else variableExpense += amount;
  }

  const totalExpense = fixedExpense + variableExpense;
  const burdenRate =
    totalIncome > 0
      ? Math.round((fixedExpense / totalIncome) * 1000) / 10
      : null;
  const tier = classifyTier(burdenRate, fixedExpense);

  return {
    totalIncome,
    fixedExpense,
    variableExpense,
    totalExpense,
    burdenRate,
    tier,
  };
}
