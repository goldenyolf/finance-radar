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
   *
   * **Phase 動態板塊路由（per 0026）之後 plate_id 為 routing 主路徑**，
   * default_account_id 降級成 fallback（plate_id null 或 plate 找不到時用）。
   */
  default_account_id: string | null;
  /**
   * 動態板塊路由（per 0026）— 指向 dashboard_plates.id。
   * webhook routing 看到此欄非 null → 抓 plate.linked_account_ids[0] 當目標帳戶。
   * Spec：「家庭分類自動進家庭板塊的綁定帳戶」— 之後 user 改板塊綁定，category
   * 路由自動跟著變，不必手動更新 default_account_id。
   */
  plate_id: string | null;
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
 * 統一分類解析器（per 0030 開放自訂分類後）：
 *   transactions.category 欄位可能存兩種形式 —
 *     (a) 7 個 built-in code ('food_dining' 等)  — 舊資料 + LLM 寫的
 *     (b) categories.id (UUID)                    — 使用者選了自訂分類時
 *
 *   本函式先試 byId（自訂命中），再試 byCode（built-in 命中）；都找不到回 null，
 *   caller 自行 fallback 到 EXPENSE_CATEGORY_LABEL['other'] 那組靜態預設。
 *
 *   pass null / empty 直接 return null，caller 拿到 null 就走「其他」灰色 chip。
 */
export function resolveCategory(
  value: string | null | undefined,
  lookup: CategoryLookup | null
): CategoryRow | null {
  if (!value || !lookup) return null;
  return lookup.byId.get(value) ?? lookup.byCode.get(value) ?? null;
}

/** UI 選單 / chip 用的分類選項。value 是要寫進 transactions.category 的值。 */
export interface CategoryOption {
  /** built-in code（'food_dining' 等）或 categories.id（自訂分類 UUID） */
  value: string;
  name: string;
  color: string;
}

/**
 * 攤平「built-in 7 大類 + 使用者自訂 expense 分類」成一份選項清單。
 *
 * 排序：built-in 依 EXPENSE_CATEGORY_LABEL 的宣告順序固定在前（使用者已經
 * 習慣那個順序，按 name 排會每次改分類名就跳位），自訂分類按 name 排在後。
 *
 * built-in 的 name / color 優先吃使用者在 /settings 改過的值（byCode 命中），
 * 沒有才退回靜態 map —— 這讓「把『餐飲食品』改名成『吃喝』」在所有選單同步。
 *
 * 這份邏輯原本在 category-drilldown-panel 與 bulk-actions-bar 各有一份逐字
 * 相同的實作，後者的註解寫「不重用是為了避免 client component 反向 import
 * drilldown-panel」—— 但它是純函式，抽到這裡就沒有那個顧慮了。
 *
 * @param builtInLabel  EXPENSE_CATEGORY_LABEL（由 caller 傳入避免循環 import
 *                      —— expense-categories.ts 已經 import 本檔的
 *                      buildCategoryLookup / resolveCategory）
 * @param builtInColor  EXPENSE_CATEGORY_COLOR
 */
export function buildCategoryOptions(
  categories: CategoryRow[] | undefined,
  builtInLabel: Record<string, string>,
  builtInColor: Record<string, string>
): CategoryOption[] {
  const lookup = categories ? buildCategoryLookup(categories) : null;
  const options: CategoryOption[] = [];

  for (const code of Object.keys(builtInLabel)) {
    const dyn = lookup?.byCode.get(code);
    options.push({
      value: code,
      name: dyn?.name ?? builtInLabel[code],
      color: dyn?.color ?? builtInColor[code],
    });
  }

  const custom = (categories ?? [])
    .filter((c) => c.type === "expense" && !c.code)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const c of custom) {
    options.push({ value: c.id, name: c.name, color: c.color });
  }

  return options;
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
