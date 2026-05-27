/**
 * 「🧛 本月吸血鬼排行榜」資料聚合 — 純函式，無 React。
 *
 * 核心點子：使用者打的 description 常常是「核心關鍵字 (備註細節)」
 * 格式，例如：
 *   "摩斯漢堡 (中餐)"     → 核心 = "摩斯漢堡"
 *   "高鐵來回 (台中出差)"  → 核心 = "高鐵來回"
 *   "全聯（每週採買）"     → 核心 = "全聯"
 *
 * 把括號內的備註砍掉後 group by，才能聚合「同一個商家不同次消費」的總額，
 * 揪出真正的失血大戶。
 *
 * 過濾：type='expense' && status='completed'（跟其他月度聚合一致）。
 */

import { num, type TransactionRow } from "@/lib/dashboard";

export interface TopMerchantPoint {
  merchant: string;
  amount: number;
  count: number;
  /** 0-100，1 位小數 — 該 merchant 占當月總支出比例 */
  percentage: number;
}

/**
 * 砍掉第一個左括號及其後所有文字（含半形 `(` 跟全形 `（`），並 trim。
 *
 * 為什麼支援兩種括號：中文輸入法常打全形「（）」，UI 上看起來都一樣，
 * 但 codepoint 不同。只認半形會漏抓一堆。
 *
 * 回 null 表示「無法當作 merchant 用」（description 是 null 或清洗後為空）。
 */
function extractMerchantKey(description: string | null): string | null {
  if (!description) return null;
  const cleaned = description.replace(/[(（].*$/, "").trim();
  return cleaned || null;
}

export function getTopMerchantsData(
  transactions: TransactionRow[],
  now: Date = new Date(),
  topN: number = 5
): TopMerchantPoint[] {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthPrefix = `${year}-${month}-`;

  // 第一輪：濾出當月已完成 expense，做名稱清洗 + 累加
  const buckets = new Map<string, { amount: number; count: number }>();
  let monthTotal = 0;

  for (const t of transactions) {
    if (t.type !== "expense" || t.status !== "completed") continue;
    if (typeof t.date !== "string" || !t.date.startsWith(monthPrefix)) continue;

    const amount = num(t.amount);
    if (amount <= 0) continue;

    const key = extractMerchantKey(t.description);
    if (!key) continue;

    const cur = buckets.get(key);
    if (cur) {
      cur.amount += amount;
      cur.count += 1;
    } else {
      buckets.set(key, { amount, count: 1 });
    }
    monthTotal += amount;
  }

  if (monthTotal <= 0) return [];

  // 第二輪：算 percentage、降序、取 top N
  return Array.from(buckets.entries())
    .map(([merchant, v]) => ({
      merchant,
      amount: v.amount,
      count: v.count,
      percentage: Math.round((v.amount / monthTotal) * 1000) / 10,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, topN);
}
