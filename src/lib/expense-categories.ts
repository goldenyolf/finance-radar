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
 *   - 「便當店」(3) 勝過「便當」(2)，「幫媽媽買便當店」會落在孝親長照
 *   - 等長關鍵字打平時，物件 key 越前面優先級越高
 *
 * 因此 key 順序刻意安排：「人物上下文」型分類（eldercare / childcare）排在
 * 「行為上下文」型（food / home / 等）之前，讓「幫媽媽買午餐」（媽媽 vs 午餐
 * 都是 2 字）優先落到孝親長照而非餐飲。
 */
export const EXPENSE_CATEGORY_KEYWORDS: Record<ExpenseCategory, string[]> = {
  eldercare: [
    "長照",
    "阿姨",
    "媽媽",
    "老家",
    "便當店",
    "孝親",
    "長輩",
    "代購",
    "爸爸",
    "外婆",
    "奶奶",
  ],
  childcare_education: [
    "保母",
    "幼兒園",
    "學費",
    "月費",
    "尿布",
    "奶粉",
    "童裝",
    "玩具",
    "兒童",
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
}

/**
 * 統計給定 transactions 中「當月已發生」的 expense，按 category 加總。
 * 回傳已過濾零項目、由大到小排序的陣列；只含 amount > 0 的分類。
 */
export function aggregateMonthlyByCategory(
  transactions: TransactionRow[],
  now: Date = new Date()
): CategorySlice[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const totals = new Map<ExpenseCategory, number>();

  for (const t of transactions) {
    if (t.type !== "expense") continue;
    if (t.status !== "completed") continue;
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const key = (t.category ?? "other") as ExpenseCategory;
    totals.set(key, (totals.get(key) ?? 0) + num(t.amount));
  }

  return Array.from(totals.entries())
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => ({
      category,
      label: EXPENSE_CATEGORY_LABEL[category],
      color: EXPENSE_CATEGORY_COLOR[category],
      amount: Math.round(amount),
    }))
    .sort((a, b) => b.amount - a.amount);
}
