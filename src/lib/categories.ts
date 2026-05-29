/**
 * Dynamic categories — 取代靜態 EXPENSE_CATEGORY_LABEL/COLOR/KEYWORDS。
 *
 * 每位會員自己的分類組合存在 categories table，由 auth.users insert
 * trigger 自動 seed 7 個預設值。前端拿這份 list 去：
 *   - PieChart / Sankey 配色（顏色 = category.color）
 *   - 顯示中文 label（label = category.name）
 *   - LINE bot keyword 匹配（keywords 由使用者編輯）
 *
 * 提供既有 7 大 code 的 fallback：code === 'food_dining' 等舊 transactions
 * 透過 categories.code 還是查得到對應分類，相容 Phase 1 backfill 後的資料。
 */

export type CategoryType = "expense" | "income";

export interface CategoryRow {
  id: string;
  user_id: string;
  /** 7 大預設分類有的穩定 code；使用者自訂的 = null */
  code: string | null;
  name: string;
  type: CategoryType;
  color: string;
  /** 逗號分隔的 LLM hint 關鍵字字串 */
  keywords: string;
  /** 每月預算上限；0 = 未設預算（pie chart 不畫進度條、LINE bot 不警告）。 */
  budget_monthly: number;
  /**
   * 固定支出 flag（房貸 / 保險 / 長照 / 居家水電 等綁死的錢）。
   * 給「財務硬性負擔率」分析用：burdenRate = fixed / totalIncome。
   * Seed 4 個 code 預設 true：childcare_education / eldercare /
   * finance_insurance / home_living。其餘 false。DB 端有 INSERT trigger
   * 自動依 code backfill。
   */
  is_fixed: boolean;
  /**
   * 該分類的「預設帳戶」— LINE bot 後綴覆蓋規則的中段 fallback：
   * 若使用者沒在訊息中明確指定帳戶（無 account_override），就照分類綁定的
   * 帳戶寫入；仍為 null → 退到 profiles.default_account_id → 最早建立的帳戶。
   * UI 預設未綁定（null），由使用者在 /settings 自行設定。
   */
  default_account_id: string | null;
  created_at?: string;
}

export interface CategoryLookup {
  /** by category_id (UUID) — 圖表配色 / transactions row 用 */
  byId: Map<string, CategoryRow>;
  /** by stable code — 舊 transactions.category snake_case 還能查 */
  byCode: Map<string, CategoryRow>;
  /** 平鋪 list — UI 列舉用 */
  all: CategoryRow[];
}

/** 把 categories array 整理成快速查表的結構，避免到處跑 .find()。*/
export function buildCategoryLookup(categories: CategoryRow[]): CategoryLookup {
  const byId = new Map<string, CategoryRow>();
  const byCode = new Map<string, CategoryRow>();
  for (const c of categories) {
    byId.set(c.id, c);
    if (c.code) byCode.set(c.code, c);
  }
  return { byId, byCode, all: categories };
}

/**
 * 拆 categories.keywords 成 string[]，過濾空字串。
 * 用 comma 分隔（包含全形＋半形 + 空白容錯）。
 */
export function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 給定一段文字 + categories 清單，用「最長關鍵字優先」匹配回傳分類。
 * 找不到回 null（caller 自行 fallback 到 'other' 或 LLM）。
 */
export function classifyByCategoryKeywords(
  text: string,
  categories: CategoryRow[]
): CategoryRow | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  // 攤平 (keyword, category) pair，按 keyword 長度遞減排序，最長優先
  type Entry = { keyword: string; category: CategoryRow };
  const entries: Entry[] = [];
  for (const c of categories) {
    if (c.type !== "expense") continue;
    for (const k of parseKeywords(c.keywords)) {
      entries.push({ keyword: k, category: c });
    }
  }
  entries.sort((a, b) => b.keyword.length - a.keyword.length);

  for (const { keyword, category } of entries) {
    if (lower.includes(keyword.toLowerCase())) return category;
  }
  return null;
}
