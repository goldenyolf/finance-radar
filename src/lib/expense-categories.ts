import { buildCategoryLookup, type CategoryRow } from "@/lib/categories";
import {
  num,
  type ExpenseCategory,
  type TransactionRow,
} from "@/lib/dashboard";

export type { ExpenseCategory };

/** UI 顯示用中文 label。DB 存的是 snake_case key。 */
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food_dining: "餐飲食品",
  childcare_education: "育兒教育",
  eldercare: "孝親長照",
  home_living: "居家生活",
  finance_insurance: "金融保險",
  transport: "交通出行",
  other: "其他",
};

/**
 * 把任意值（含 unknown / null / 不在 enum 內的字串）安全轉成中文 label。
 * 給 base-ui Select.Value 的 render-function children 用：
 * base-ui 的 value 型別是 any，所以走 unknown 收斂後再查表。
 */
export function getCategoryLabel(value: unknown): string {
  if (typeof value !== "string" || !value) return "選擇花費類型";
  if (value in EXPENSE_CATEGORY_LABEL) {
    return EXPENSE_CATEGORY_LABEL[value as ExpenseCategory];
  }
  return value;
}

/** 圓餅圖 / Badge 用色票。Apple 風格偏溫暖、柔和。 */
export const EXPENSE_CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  food_dining: "#F59E0B", // amber-500，溫暖橘
  childcare_education: "#F472B6", // pink-400，溫柔粉
  eldercare: "#B45309", // amber-700，黃褐 / 焦糖
  home_living: "#14B8A6", // teal-500，居家綠青
  finance_insurance: "#6366F1", // indigo-500，金融藍
  transport: "#0EA5E9", // sky-500，行進感
  other: "#94A3B8", // slate-400，中性灰
};

/**
 * 關鍵字 → 分類映射。匹配時走「最長關鍵字優先」（見 classifyByKeyword）：
 *   - 「托育機構」(4) 勝過「托育」(2)，避免短關鍵字提早 hijack 長句
 *   - 等長關鍵字打平時，物件 key 越前面優先級越高
 *
 * 因此 key 順序刻意安排：「人物上下文」型分類（eldercare / childcare）排在
 * 「行為上下文」型（food / home / 等）之前，讓「幫長輩買午餐」（長輩 vs 午餐
 * 都是 2 字）優先落到孝親長照而非餐飲。
 *
 * Fork 提示：可依自己家庭結構在各 category 內補關鍵字，例如把家人暱稱
 * 加進 eldercare / childcare 提升精準度。
 */
export const EXPENSE_CATEGORY_KEYWORDS: Record<ExpenseCategory, string[]> = {
  eldercare: [
    "長照",
    "長輩",
    "父母",
    "老家",
    "便當店",
    "孝親",
    "原生家庭",
    "代購",
    "外婆",
    "外公",
    "奶奶",
    "爺爺",
  ],
  childcare_education: [
    "托育",
    "幼兒園",
    "學費",
    "月費",
    "尿布",
    "奶粉",
    "童裝",
    "玩具",
    "孩子",
    "子女",
    "繪本",
    "課後",
    "安親",
  ],
  finance_insurance: [
    "保險",
    "醫療險",
    "意外險",
    "車險",
    "儲蓄險",
    "投資",
    "基金",
    "ETF",
    "股票",
  ],
  home_living: [
    "水電",
    "瓦斯",
    "電費",
    "水費",
    "衛生紙",
    "管理費",
    "家電",
    "家具",
    "清潔",
    "洗衣",
    "燈泡",
    "網路",
    "第四台",
  ],
  transport: [
    "加油",
    "eTag",
    "ETC",
    "停車",
    "維修",
    "保養",
    "高鐵",
    "計程車",
    "捷運",
    "公車",
    "Uber",
    "火車",
    "機票",
  ],
  food_dining: [
    "三餐",
    "午餐",
    "晚餐",
    "早餐",
    "便當",
    "手搖",
    "飲料",
    "咖啡",
    "茶",
    "Cama",
    "星巴克",
    "Starbucks",
    "路易莎",
    "Louisa",
    "85度C",
    "麵包",
    "蛋糕",
    "甜點",
    "超市",
    "買菜",
    "全聯",
    "外送",
    "Uber Eats",
    "foodpanda",
    "餐廳",
    "宵夜",
    "聚餐",
  ],
  other: [],
};

/** 預先攤平成 [keyword, category] pairs 並按長度遞減排序，匹配時走最長優先。 */
const KEYWORD_INDEX: Array<{ keyword: string; category: ExpenseCategory }> =
  Object.entries(EXPENSE_CATEGORY_KEYWORDS)
    .flatMap(([category, keywords]) =>
      keywords.map((keyword) => ({
        keyword,
        category: category as ExpenseCategory,
      }))
    )
    .sort((a, b) => b.keyword.length - a.keyword.length);

/**
 * 依關鍵字匹配自動分類。找不到任何匹配時回傳 'other'。
 * 大小寫不敏感（純中文不影響，但兼容 eTag / ETC 等英數）。
 */
export function classifyByKeyword(text: string): ExpenseCategory {
  if (!text) return "other";
  const lower = text.toLowerCase();
  for (const { keyword, category } of KEYWORD_INDEX) {
    if (lower.includes(keyword.toLowerCase())) return category;
  }
  return "other";
}

export interface CategorySlice {
  category: ExpenseCategory;
  label: string;
  color: string;
  amount: number;
  /** 每月預算上限；0 = 未設預算 — pie chart 用這個決定要不要畫進度條 */
  budget: number;
}

/**
 * 描述欄位含這些字串時，視為「系統 / 校正 / 期初」非真實日常消費 — 預設過濾。
 * 大小寫不敏感，純 includes 比對。新增關鍵字直接擴這陣列。
 */
const SYSTEM_DESCRIPTION_MARKERS = [
  "system_initial",
  "系統初始",
  "期初",
  "校正餘額",
  "餘額校正",
  "餘額調整",
  "資產調度",
  "資產重新分配",
  "opening balance",
  "initial balance",
];

/**
 * 單筆 expense 在當月被視為 outlier 的門檻：佔 raw monthly total 超過此比例。
 * 0.33 = 一筆超過全月 1/3 → 視為「大額調度」非日常 — 過濾掉避免圓餅被吃掉。
 */
const OUTLIER_RATIO_THRESHOLD = 0.33;

/**
 * 絕對金額門檻：單筆 ≥ NT$50,000 視為非日常一次性大額（家電 / 醫療 / 年繳保險 /
 * 旅遊團費 …）。比例門檻在大月份會擦邊不過（e.g. 149K / 462K = 32.4% 卡在
 * 33% 下方），絕對門檻當保底。想調鬆 / 緊改這一個常數即可。
 */
const OUTLIER_ABSOLUTE_THRESHOLD = 50_000;

/**
 * 判定單筆 transaction 是否屬於「系統 / 大額調度」非日常消費。
 *
 * 三條判定（任一命中即視為 outlier）：
 *   (a) description 含 SYSTEM_DESCRIPTION_MARKERS 任一字串
 *   (b) 單筆金額 ≥ OUTLIER_ABSOLUTE_THRESHOLD — 絕對金額保底
 *   (c) 單筆金額 / 當月 raw total > 0.33 — 比例門檻，跟著規模自適應
 *
 * monthlyTotal 為 0 時略過 (c)，只看 (a)(b) — 避免 division by zero。
 */
function isOutlierExpense(
  tx: TransactionRow,
  monthlyTotal: number
): boolean {
  const desc = (tx.description ?? "").toLowerCase();
  for (const m of SYSTEM_DESCRIPTION_MARKERS) {
    if (desc.includes(m.toLowerCase())) return true;
  }
  const amt = num(tx.amount);
  if (amt >= OUTLIER_ABSOLUTE_THRESHOLD) return true;
  if (monthlyTotal > 0 && amt / monthlyTotal > OUTLIER_RATIO_THRESHOLD) {
    return true;
  }
  return false;
}

export interface AggregateOptions {
  /**
   * 排除「系統初始 / 校正餘額 / 異常大額調度」非日常消費（per spec）。
   * - true (建議預設): 圓餅圖回到真實日常消費
   * - false: 完整 raw view，含所有當月已完成 expense
   * 不影響 type='transfer' / type='income' 的過濾（那本來就排除）。
   */
  excludeOutliers?: boolean;
}

/**
 * 統計給定 transactions 中「當月已發生」的 expense，按 category 加總。
 * 回傳已過濾零項目、由大到小排序的陣列；只含 amount > 0 的分類。
 *
 * 若提供 `categories`（動態 DB 來源），label/color 會從那邊 byCode 查詢，
 * 讓使用者在 /settings 改色名後即時反映到圖表；否則 fallback 到靜態常數。
 *
 * excludeOutliers (per UAT spec)：
 *   兩段式 aggregation — 先算 raw monthly total 當分母，第二段過濾掉
 *   「系統 / 大額調度」outliers 後重算分類總額。這樣 outlier 判定是
 *   data-driven 比例，不靠 hardcoded 金額門檻。
 */
/**
 * 撈當月「合格 expense」清單 — 跟 aggregateMonthlyByCategory 同款過濾邏輯，
 * 但回 transaction 陣列而非分類加總，給「圓餅鑽取明細」(per UAT spec drill-down)
 * 共用：圓餅圖跟下方 drill-down panel 數據基礎一致，避免「pie 顯示 X 元 / 點開
 * 列表加總 ≠ X」的不一致。
 *
 * 過濾鏈跟 aggregator 對齊：
 *   1. type='expense' + status='completed' + 同月份
 *   2. (可選) excludeOutliers — 兩段式：先算 raw total 當門檻，再過濾 outlier
 *
 * 不在這層 sort — caller 自己決定 ASC/DESC（pie 走 amount DESC，drill-down 走 date DESC）。
 */
export function filterMonthlyExpenses(
  transactions: TransactionRow[],
  now: Date = new Date(),
  options?: AggregateOptions
): TransactionRow[] {
  const year = now.getFullYear();
  const month = now.getMonth();

  const monthExpenses: TransactionRow[] = [];
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    if (t.status !== "completed") continue;
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    monthExpenses.push(t);
  }

  if (!options?.excludeOutliers) return monthExpenses;

  const rawTotal = monthExpenses.reduce((s, t) => s + num(t.amount), 0);
  return monthExpenses.filter((t) => !isOutlierExpense(t, rawTotal));
}

export function aggregateMonthlyByCategory(
  transactions: TransactionRow[],
  now: Date = new Date(),
  categories?: CategoryRow[],
  options?: AggregateOptions
): CategorySlice[] {
  // 兩段式過濾抽到 filterMonthlyExpenses（drill-down 共用，確保數據一致）
  const workingSet = filterMonthlyExpenses(transactions, now, options);

  const totals = new Map<ExpenseCategory, number>();
  for (const t of workingSet) {
    const key = (t.category ?? "other") as ExpenseCategory;
    totals.set(key, (totals.get(key) ?? 0) + num(t.amount));
  }

  const lookup = categories ? buildCategoryLookup(categories) : null;

  return Array.from(totals.entries())
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => {
      const dyn = lookup?.byCode.get(category);
      return {
        category,
        label: dyn?.name ?? EXPENSE_CATEGORY_LABEL[category],
        color: dyn?.color ?? EXPENSE_CATEGORY_COLOR[category],
        amount: Math.round(amount),
        budget: dyn?.budget_monthly ?? 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}
