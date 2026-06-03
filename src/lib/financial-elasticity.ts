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
import {
  expandToMonthly,
  num,
  type IncomeCategory,
  type RecurringRow,
  type TransactionRow,
} from "@/lib/dashboard";

export type ElasticityTier = "safe" | "watch" | "alert";

/** 收入多元化分項（per 0017）— UI 用來顯示非工資佔比智囊 */
export interface IncomeBreakdown {
  salary: number;
  side_hustle: number;
  investment: number;
  other: number;
  /** salary 以外的加總 ÷ totalIncome × 100；totalIncome=0 時為 null */
  nonWagePct: number | null;
}

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
  /**
   * 收入多元化分項。totalIncome=0 + 走 recurring fallback 時，全部歸到
   * `other` bucket 並標記 isFromRecurring=true（無法細分維度）。
   */
  incomeBreakdown: IncomeBreakdown;
  /**
   * 真實當月收入是否為 0 但用 recurring 預期收入當分母 — UI 用此 flag
   * 加灰字小標「(基於預期固定收入)」，避免月初看到 0% 誤判財務絕佳。
   */
  isFallbackBaseline: boolean;
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

/**
 * 計算 recurring_payments 表中當月預期固定收入總額。
 * 每筆 recurring 用 expandToMonthly 攤平頻率 → 加總所有 type='income' 的條目。
 * Caller 端的 fallback：真實 totalIncome=0 但 user 設過 recurring 收入時用這個
 * 當分母，避免月初還沒入帳就被誤判「財務彈性絕佳」。
 */
function computeRecurringMonthlyIncome(recurring: RecurringRow[]): number {
  let monthly = 0;
  for (const r of recurring) {
    if (r.type !== "income") continue;
    monthly += expandToMonthly(num(r.amount), r.frequency);
  }
  return monthly;
}

export function buildFinancialElasticity(
  transactions: TransactionRow[],
  categories: CategoryRow[],
  now: Date = new Date(),
  recurring: RecurringRow[] = []
): FinancialElasticityData {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthPrefix = `${year}-${month}-`;

  // categories.byCode → is_fixed 查表（避免每筆 transaction 跑 .find）
  const isFixedByCode = new Map<string, boolean>();
  for (const c of categories) {
    if (c.code) isFixedByCode.set(c.code, c.is_fixed);
  }

  let realTotalIncome = 0;
  let fixedExpense = 0;
  let variableExpense = 0;
  // 收入多元化分項：依 income_category 累加
  const breakdownAcc: Record<IncomeCategory, number> = {
    salary: 0,
    side_hustle: 0,
    investment: 0,
    other: 0,
  };

  for (const t of transactions) {
    if (t.status !== "completed") continue;
    if (typeof t.date !== "string" || !t.date.startsWith(monthPrefix)) continue;

    const amount = num(t.amount);
    if (amount <= 0) continue;

    if (t.type === "income") {
      realTotalIncome += amount;
      // income_category null → 落 other bucket（per prompt fallback 規則 E）
      const ic = (t.income_category ?? "other") as IncomeCategory;
      breakdownAcc[ic] += amount;
      continue;
    }
    if (t.type !== "expense") continue; // transfer skip

    // category 可能是 code（snake_case）或 null。未知 / null → 視為浮動。
    const isFixed = t.category ? (isFixedByCode.get(t.category) ?? false) : false;
    if (isFixed) fixedExpense += amount;
    else variableExpense += amount;
  }

  const totalExpense = fixedExpense + variableExpense;

  // 零收入 fallback：真實 income=0 但 recurring 有設預期收入 → 用 recurring
  // 月度收入當分母。標 isFallbackBaseline=true 讓 UI 補小標說明。
  const recurringMonthlyIncome = computeRecurringMonthlyIncome(recurring);
  const isFallbackBaseline =
    realTotalIncome === 0 && recurringMonthlyIncome > 0;
  const effectiveIncome = isFallbackBaseline
    ? recurringMonthlyIncome
    : realTotalIncome;

  const burdenRate =
    effectiveIncome > 0
      ? Math.round((fixedExpense / effectiveIncome) * 1000) / 10
      : null;
  const tier = classifyTier(burdenRate, fixedExpense);

  // 非工資佔比：salary 以外的加總 / 總實際收入。fallback 路徑下 breakdown
  // 全 0 → nonWagePct=null，UI 不顯示「收入多元化」智囊（沒可用維度資料）。
  const nonWageAmount =
    breakdownAcc.side_hustle + breakdownAcc.investment + breakdownAcc.other;
  const nonWagePct =
    realTotalIncome > 0
      ? Math.round((nonWageAmount / realTotalIncome) * 1000) / 10
      : null;

  return {
    // 對外仍 expose 真實 totalIncome（讓 UI Row 顯示真實值），分母換算用
    // effectiveIncome 內部隱藏，透過 burdenRate / isFallbackBaseline 暴露語意。
    totalIncome: realTotalIncome,
    fixedExpense,
    variableExpense,
    totalExpense,
    burdenRate,
    tier,
    incomeBreakdown: {
      ...breakdownAcc,
      nonWagePct,
    },
    isFallbackBaseline,
  };
}
