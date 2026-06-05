/**
 * 硬規則帳戶關鍵字攔截器 — LLM 之前的「絕對精準度」防線。
 *
 * 問題：
 *   LLM 在字詞順序混雜時會把帳戶名誤判成消費描述
 *     例：「晚餐（測試） 台新信用卡 100」→ LLM 抽 description="台新信用卡"，
 *         account_override=null → fallback chain 跌到 type='cash' 兜底，
 *         信用卡消費被錯塞到現金錢包。
 *
 * 解法：
 *   把 user 自己定義的 accounts.keywords（per 0019）拿來做硬規則攔截。
 *   命中即在記憶體中鎖定 account_id，並從原文剪掉**所有屬於該帳戶**的
 *   關鍵字後再交給 LLM。LLM 只負責拆 amount / category / description，
 *   account 已經由本模組鎖死，LLM 不能反悔。
 *
 * 設計決策：
 *   a) 純函式無 side effect，可在任何 runtime 跑（Edge / Node 都行）。
 *      DB 操作交給 caller — 本模組只接 in-memory 的 LineAccountContext[]。
 *
 *   b) 「最長關鍵字優先」匹配：避免 ['台新', '台新信用卡'] 中 '台新' 偷跑
 *      ('台新信用卡' 本來該命中卡別、結果被攔成銀行戶)。同分時取 accounts
 *      陣列順序（即 .order("id") 的字典序）→ 行為可重現可測。
 *
 *   c) 命中後**該帳戶的所有 keywords** 都會從原文挖掉，不只挖匹配到那一個。
 *      理由：user 可能在同句重複提（「台新信用卡 台新 100」），若只剪一個，
 *      LLM 還是會在剩下的「台新」上掙扎；一次剪乾淨最穩。
 *
 *   d) 大小寫不敏感（Cama / Costco / 7-11 等英數品牌名混在 keywords 也適用）；
 *      Unicode CJK 字本身無大小寫概念，loose 一點不會誤命中。
 *
 *   e) 不做 normalize（不剝括號 / 全形空白）— interceptor 要看到「跟使用者
 *      打的字一模一樣」的串才能精準剪掉。normalize 是 matchAccount() 那邊
 *      LLM 模糊比對的工具，跟硬規則層職責不同。
 *
 *   f) 跨帳戶衝突：第一個命中的關鍵字決定鎖到哪個帳戶（依長度排序的結果）。
 *      User 把「台新」同時列在帳戶 A 跟帳戶 B 的 keywords 是用戶錯誤，本層
 *      不會主動偵測 — 但因為排序穩定，至少行為可預測。
 */

import type { AccountType, PaymentMethod } from "@/lib/dashboard";
import type { LineAccountContext } from "@/lib/line-llm-parse";

export interface InterceptorResult {
  /** 命中時為帳戶；沒命中 null（caller fallback 回 LLM 抽 override）。 */
  matchedAccount: LineAccountContext | null;
  /** 命中的那個關鍵字原文（debug / log 用）；沒命中 null。 */
  matchedKeyword: string | null;
  /**
   * 命中時 spec 要求「鎖定 payment_method」依該帳戶 type 派生：
   *   cash → 'cash' / credit_card → 'credit_card' / bank → 'transfer'
   * 沒命中 → null（caller 走 LLM 抽到的 payment_method）。
   * 這個欄位是硬規則：caller 不該用 LLM 結果覆蓋它。
   */
  lockedPaymentMethod: PaymentMethod | null;
  /**
   * 清洗後的文字 — 命中時挖掉該帳戶**所有**關鍵字、collapse 連續空白。
   * 沒命中時 = 原文 trim。
   */
  cleanedText: string;
}

/** account.type → 該帳戶的「天然」付款方式語意。enum 三值都有確定對應。 */
export function paymentMethodForAccountType(type: AccountType): PaymentMethod {
  switch (type) {
    case "cash":
      return "cash";
    case "credit_card":
      return "credit_card";
    case "bank":
      return "transfer";
  }
}

/**
 * 主入口。
 *
 * 流程：
 *   1) 攤平所有 (account, keyword) pair，按 keyword.length DESC 排序
 *   2) 第一個在 text 裡 case-insensitive 找到的 pair 即為命中
 *   3) 命中後：把該帳戶**所有** keywords 從 text 全部剪掉（仍長度優先），
 *      collapse 連續空白後 trim
 *   4) 沒命中：matchedAccount=null, cleanedText=text.trim()
 */
export function interceptAccountKeywords(
  text: string,
  accounts: LineAccountContext[]
): InterceptorResult {
  const trimmed = text ?? "";
  const noMatch: InterceptorResult = {
    matchedAccount: null,
    matchedKeyword: null,
    lockedPaymentMethod: null,
    cleanedText: trimmed.trim(),
  };

  if (!trimmed.trim() || accounts.length === 0) return noMatch;

  const entries = flattenAndSortKeywords(accounts);
  if (entries.length === 0) return noMatch;

  const lowered = trimmed.toLowerCase();
  let hit: { account: LineAccountContext; keyword: string } | null = null;
  for (const e of entries) {
    if (lowered.includes(e.keywordLower)) {
      hit = { account: e.account, keyword: e.keyword };
      break; // spec: 「Break 迴圈，停止比對其他帳戶」
    }
  }

  if (!hit) return noMatch;

  const cleanedText = stripAccountKeywords(trimmed, hit.account.keywords);
  return {
    matchedAccount: hit.account,
    matchedKeyword: hit.keyword,
    lockedPaymentMethod: paymentMethodForAccountType(hit.account.type),
    cleanedText,
  };
}

/**
 * 從文字中剪掉**該帳戶所有 keywords** 的每次出現（case-insensitive，global），
 * 再 collapse 連續空白 + trim。長度 DESC 先剪，避免 '台新' 先剪掉破壞
 * '台新信用卡' 的匹配（雖然兩個都會剪，順序保留訊息完整性）。
 */
export function stripAccountKeywords(text: string, keywords: string[]): string {
  const filtered = keywords.filter((k): k is string => typeof k === "string" && k.length > 0);
  if (filtered.length === 0) return text.trim();

  const sorted = [...filtered].sort((a, b) => b.length - a.length);
  let result = text;
  for (const k of sorted) {
    const re = new RegExp(escapeRegex(k), "gi");
    result = result.replace(re, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

/** flatten + sort by keyword length DESC（最長優先攔截）。 */
function flattenAndSortKeywords(
  accounts: LineAccountContext[]
): Array<{ account: LineAccountContext; keyword: string; keywordLower: string }> {
  const out: Array<{
    account: LineAccountContext;
    keyword: string;
    keywordLower: string;
  }> = [];
  for (const acc of accounts) {
    for (const k of acc.keywords ?? []) {
      if (typeof k !== "string") continue;
      const trimmed = k.trim();
      if (!trimmed) continue;
      out.push({ account: acc, keyword: trimmed, keywordLower: trimmed.toLowerCase() });
    }
  }
  // 長度 DESC；同長度時用 keyword 字典序，行為穩定可測
  out.sort((a, b) => b.keyword.length - a.keyword.length || a.keyword.localeCompare(b.keyword));
  return out;
}

/** RegExp 特殊字元 escape，安全嵌入 user-defined 字串。 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
