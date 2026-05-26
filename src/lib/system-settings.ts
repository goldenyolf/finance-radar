import type { ExpenseCategory } from "@/lib/expense-categories";

/**
 * system_settings 表是個 key-value 倉庫，存使用者自訂的預算 / 門檻設定。
 * Schema：
 *   create table system_settings (key text primary key, value numeric not null);
 *
 * 為什麼用 KV 不用 typed columns：未來要加新設定（例如 alert_threshold_pct、
 * default_account 等）不用做 schema migration，直接 upsert 一筆新 key 即可。
 */

export interface SystemSettingRow {
  key: string;
  value: number | string;
}

/** 可設預算的分類（排除 'other' — 它是兜底分類，不該綁預算）。 */
export const BUDGET_CATEGORIES = [
  "food_dining",
  "childcare_education",
  "eldercare",
  "home_living",
  "finance_insurance",
  "transport",
] as const satisfies readonly ExpenseCategory[];

export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const SETTING_KEY_SAFETY_THRESHOLD = "safety_threshold";

export function budgetKey(cat: BudgetCategory): string {
  return `budget_${cat}`;
}

/** 全套預設值。資料庫沒設定時用，UI 開啟面板時 placeholder 也用這套。 */
export const DEFAULT_SETTINGS = {
  safetyThreshold: 100000,
  budgets: {
    food_dining: 15000,
    childcare_education: 30000,
    eldercare: 10000,
    home_living: 20000,
    finance_insurance: 5000,
    transport: 8000,
  } satisfies Record<BudgetCategory, number>,
};

export interface ResolvedSettings {
  /** 全域現金安全門檻；UI 設定值 > 0 才生效，否則 fallback 到 user 表或 0 */
  safetyThreshold: number | null;
  /** 各分類預算上限；只列「user 有設且 > 0」的分類。沒設就 undefined。 */
  budgets: Partial<Record<BudgetCategory, number>>;
}

/** 把 KV rows 解析成型別 object。Pure function，給 server / client 共用。 */
export function parseSettings(rows: SystemSettingRow[]): ResolvedSettings {
  let safetyThreshold: number | null = null;
  const budgets: Partial<Record<BudgetCategory, number>> = {};

  for (const row of rows) {
    const v = typeof row.value === "number" ? row.value : Number(row.value);
    if (!Number.isFinite(v) || v <= 0) continue;

    if (row.key === SETTING_KEY_SAFETY_THRESHOLD) {
      safetyThreshold = v;
      continue;
    }
    // budget_<category> pattern
    if (row.key.startsWith("budget_")) {
      const cat = row.key.slice("budget_".length) as BudgetCategory;
      if ((BUDGET_CATEGORIES as readonly string[]).includes(cat)) {
        budgets[cat] = v;
      }
    }
  }

  return { safetyThreshold, budgets };
}
