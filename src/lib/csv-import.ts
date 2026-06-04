/**
 * 台灣主流網銀 CSV 智慧解析器 — CTBC / Taishin 信用卡帳單為主。
 *
 * 不引入 papaparse / csv-parse 依賴 — 輕量 parser 自製，省 ~50KB bundle。
 * Handles：quoted field with comma / BOM / 雙引號 escape / CRLF。
 */

import type { ExpenseCategory } from "@/lib/expense-categories";

/* ─────────────────── 解析 row 模型 ─────────────────── */

export type RowStatus =
  | "new"           // 新交易，預設勾選匯入
  | "duplicate"     // 與既有 DB 交易撞鍵，預設不匯入
  | "refund";       // 退款 / 負金額，預設不匯入

export interface ParsedRow {
  /** YYYY-MM-DD */
  date: string;
  /** 商家 / 摘要 */
  description: string;
  /** 正數 = 消費；負數 = 退款 (status='refund' 處理) */
  amount: number;
  /** 智慧分類器輸出，user 可在 dialog override */
  suggestedCategory: ExpenseCategory;
  status: RowStatus;
  /** dedup 用內部鍵 — UI 不顯示 */
  _dedupKey: string;
}

export type BankFormat = "ctbc" | "taishin" | "generic";

/* ─────────────────── CSV 解析 ─────────────────── */

/**
 * 輕量 CSV parser — 處理：BOM / quoted field / 雙引號 escape / CRLF。
 * 不支援 multi-line cell（極罕見、信用卡 CSV 用不到）。
 */
export function parseCsv(text: string): string[][] {
  // strip BOM
  const cleaned = text.replace(/^﻿/, "");
  const lines: string[] = [];
  let cursor = 0;
  let current = "";
  let inQuotes = false;

  // 第一階段：依 newline 切（小心 quoted 內的 newline；信用卡 CSV 一般沒有）
  while (cursor < cleaned.length) {
    const ch = cleaned[cursor];
    if (ch === '"') {
      // double quote escape
      if (inQuotes && cleaned[cursor + 1] === '"') {
        current += '"';
        cursor += 2;
        continue;
      }
      inQuotes = !inQuotes;
      current += ch;
      cursor++;
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (current) lines.push(current);
      current = "";
      // skip CRLF 的 LF
      if (ch === "\r" && cleaned[cursor + 1] === "\n") cursor++;
      cursor++;
      continue;
    }
    current += ch;
    cursor++;
  }
  if (current) lines.push(current);

  // 第二階段：每行切欄位
  return lines.map(parseCsvLine);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current.trim());
  return fields;
}

/* ─────────────────── 銀行格式判定 ─────────────────── */

/**
 * 看 header 推測銀行格式。CTBC 跟 Taishin 都用中文 header，靠關鍵字判別。
 * 命中不了 → 'generic'（caller 仍可嘗試 best-effort 抽欄位）。
 */
export function detectBankFormat(headerRow: string[]): BankFormat {
  const headerStr = headerRow.join("|").toLowerCase();
  // CTBC 信用卡明細典型 header：卡號末四碼 / 消費日 / 入帳日 / 消費明細 / 消費地 / 消費金額
  if (
    headerStr.includes("卡號末四碼") ||
    headerStr.includes("消費明細") ||
    (headerStr.includes("消費日") && headerStr.includes("入帳日"))
  ) {
    return "ctbc";
  }
  // Taishin 信用卡明細典型 header：交易日期 / 帳款日期 / 商店名稱 / 消費金額
  if (
    headerStr.includes("帳款日期") ||
    headerStr.includes("商店名稱") ||
    (headerStr.includes("交易日期") && headerStr.includes("商店"))
  ) {
    return "taishin";
  }
  return "generic";
}

/* ─────────────────── 欄位抽取 ─────────────────── */

/**
 * 把 header 中找特定關鍵字的 column index 拉出來。沒命中回 -1。
 */
function findColumnIndex(headerRow: string[], keywords: string[]): number {
  const lower = headerRow.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h.includes(kw.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

interface ColumnMap {
  date: number;
  description: number;
  amount: number;
}

function detectColumns(headerRow: string[], format: BankFormat): ColumnMap {
  switch (format) {
    case "ctbc":
      return {
        date: findColumnIndex(headerRow, ["消費日", "交易日"]),
        description: findColumnIndex(headerRow, [
          "消費明細",
          "消費內容",
          "消費商家",
          "商家名稱",
        ]),
        amount: findColumnIndex(headerRow, [
          "消費金額(twd)",
          "消費金額",
          "金額(新台幣)",
          "新台幣金額",
        ]),
      };
    case "taishin":
      return {
        date: findColumnIndex(headerRow, ["交易日期", "消費日"]),
        description: findColumnIndex(headerRow, [
          "商店名稱",
          "消費明細",
          "商店",
        ]),
        amount: findColumnIndex(headerRow, [
          "消費金額",
          "新台幣金額",
          "台幣金額",
        ]),
      };
    case "generic":
    default:
      return {
        date: findColumnIndex(headerRow, ["date", "日期"]),
        description: findColumnIndex(headerRow, [
          "description",
          "merchant",
          "摘要",
          "商家",
          "商店",
        ]),
        amount: findColumnIndex(headerRow, [
          "amount",
          "金額",
          "消費金額",
        ]),
      };
  }
}

/* ─────────────────── 日期 / 金額 normalize ─────────────────── */

/**
 * 多種台灣日期格式 → YYYY-MM-DD：
 *   - 2026/06/04
 *   - 2026-06-04
 *   - 2026.06.04
 *   - 115/06/04 (民國年)
 *   - 20260604
 *
 * 解析失敗回空字串，caller 視為無效 row。
 */
export function normalizeDate(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.trim().replace(/\s+/g, "");

  // 8-digit 純數字
  if (/^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }

  // YYYY/MM/DD or YYYY-MM-DD or YYYY.MM.DD（西元年 4 位）
  const ymd = cleaned.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 民國年 YYY/MM/DD (3 位數年 → +1911 = 西元)
  const roc = cleaned.match(/^(\d{2,3})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (roc) {
    const [, yRoc, m, d] = roc;
    const ad = Number(yRoc) + 1911;
    return `${ad}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return "";
}

/**
 * 金額字串 → number。處理：千分號 / 引號 / NT$ 前綴 / 全形 / 帶括號的負數。
 */
export function normalizeAmount(raw: string): number {
  if (!raw) return 0;
  let s = raw.trim();
  // 全形 → 半形 (常見於某些舊版銀行 CSV)
  s = s.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
  // 移除 NT$ / TWD / 引號 / 空白 / 千分號
  s = s.replace(/[NT\$TWD,，"\s]/g, "");
  // 帶括號的金額 = 負值（會計慣例 (1234) = -1234）
  const isNegative = /^\(.+\)$/.test(s);
  s = s.replace(/[\(\)]/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return isNegative ? -n : n;
}

/* ─────────────────── 智慧分類 ─────────────────── */

/**
 * 關鍵字 → ExpenseCategory 對照表。順序：
 *   1) 先匹配 substring，由長到短（避免「家」誤命中「家樂福」之外的）
 *   2) 全部 lowercase 比對
 *   3) 都沒中 → 'other'
 *
 * 此 map 為「補 LINE bot LLM 之外的 fast lookup」— 信用卡 CSV 商家欄位
 * 大多很短（最多 16 字），規則式分類比打 LLM 經濟很多。
 */
const MERCHANT_CATEGORY_MAP: Array<{
  pattern: string;
  category: ExpenseCategory;
}> = [
  // food_dining
  { pattern: "全聯", category: "food_dining" },
  { pattern: "全家", category: "food_dining" },
  { pattern: "7-11", category: "food_dining" },
  { pattern: "7eleven", category: "food_dining" },
  { pattern: "family mart", category: "food_dining" },
  { pattern: "ok mart", category: "food_dining" },
  { pattern: "頂好", category: "food_dining" },
  { pattern: "家樂福", category: "food_dining" },
  { pattern: "carrefour", category: "food_dining" },
  { pattern: "costco", category: "food_dining" },
  { pattern: "大潤發", category: "food_dining" },
  { pattern: "麥當勞", category: "food_dining" },
  { pattern: "mcdonald", category: "food_dining" },
  { pattern: "肯德基", category: "food_dining" },
  { pattern: "kfc", category: "food_dining" },
  { pattern: "摩斯", category: "food_dining" },
  { pattern: "mos", category: "food_dining" },
  { pattern: "subway", category: "food_dining" },
  { pattern: "星巴克", category: "food_dining" },
  { pattern: "starbucks", category: "food_dining" },
  { pattern: "路易莎", category: "food_dining" },
  { pattern: "louisa", category: "food_dining" },
  { pattern: "cama", category: "food_dining" },
  { pattern: "八方雲集", category: "food_dining" },
  { pattern: "鼎泰豐", category: "food_dining" },
  { pattern: "丹堤", category: "food_dining" },
  { pattern: "ubereats", category: "food_dining" },
  { pattern: "foodpanda", category: "food_dining" },
  { pattern: "熊貓", category: "food_dining" },
  { pattern: "餐廳", category: "food_dining" },
  { pattern: "早餐", category: "food_dining" },
  { pattern: "午餐", category: "food_dining" },
  { pattern: "晚餐", category: "food_dining" },
  { pattern: "咖啡", category: "food_dining" },
  { pattern: "飲料", category: "food_dining" },
  { pattern: "手搖", category: "food_dining" },
  { pattern: "茶坊", category: "food_dining" },
  { pattern: "麵包", category: "food_dining" },
  { pattern: "蛋糕", category: "food_dining" },
  { pattern: "便當", category: "food_dining" },
  // transport
  { pattern: "uber", category: "transport" },
  { pattern: "lalamove", category: "transport" },
  { pattern: "台灣大車隊", category: "transport" },
  { pattern: "計程車", category: "transport" },
  { pattern: "高鐵", category: "transport" },
  { pattern: "台鐵", category: "transport" },
  { pattern: "捷運", category: "transport" },
  { pattern: "悠遊卡", category: "transport" },
  { pattern: "公車", category: "transport" },
  { pattern: "中油", category: "transport" },
  { pattern: "台塑", category: "transport" },
  { pattern: "加油", category: "transport" },
  { pattern: "停車", category: "transport" },
  { pattern: "etag", category: "transport" },
  { pattern: "etc", category: "transport" },
  { pattern: "高速公路", category: "transport" },
  { pattern: "過路費", category: "transport" },
  // home_living
  { pattern: "中華電信", category: "home_living" },
  { pattern: "遠傳", category: "home_living" },
  { pattern: "台灣大哥大", category: "home_living" },
  { pattern: "亞太電信", category: "home_living" },
  { pattern: "netflix", category: "home_living" },
  { pattern: "spotify", category: "home_living" },
  { pattern: "apple.com", category: "home_living" },
  { pattern: "google", category: "home_living" },
  { pattern: "蝦皮", category: "home_living" },
  { pattern: "shopee", category: "home_living" },
  { pattern: "momo", category: "home_living" },
  { pattern: "pchome", category: "home_living" },
  { pattern: "ikea", category: "home_living" },
  { pattern: "宜家", category: "home_living" },
  { pattern: "燦坤", category: "home_living" },
  { pattern: "全國電子", category: "home_living" },
  { pattern: "特力屋", category: "home_living" },
  { pattern: "電費", category: "home_living" },
  { pattern: "水費", category: "home_living" },
  { pattern: "瓦斯", category: "home_living" },
  { pattern: "房租", category: "home_living" },
  { pattern: "管理費", category: "home_living" },
  // childcare_education
  { pattern: "幼兒園", category: "childcare_education" },
  { pattern: "安親班", category: "childcare_education" },
  { pattern: "補習班", category: "childcare_education" },
  { pattern: "學費", category: "childcare_education" },
  { pattern: "兒童", category: "childcare_education" },
  { pattern: "嬰兒", category: "childcare_education" },
  { pattern: "親子", category: "childcare_education" },
  { pattern: "玩具反斗城", category: "childcare_education" },
  // eldercare
  { pattern: "醫院", category: "eldercare" },
  { pattern: "診所", category: "eldercare" },
  { pattern: "藥局", category: "eldercare" },
  { pattern: "屈臣氏", category: "eldercare" },
  { pattern: "康是美", category: "eldercare" },
  { pattern: "養老", category: "eldercare" },
  { pattern: "看護", category: "eldercare" },
  // finance_insurance
  { pattern: "國泰人壽", category: "finance_insurance" },
  { pattern: "富邦人壽", category: "finance_insurance" },
  { pattern: "南山人壽", category: "finance_insurance" },
  { pattern: "新光人壽", category: "finance_insurance" },
  { pattern: "保險", category: "finance_insurance" },
  { pattern: "信用卡費", category: "finance_insurance" },
  { pattern: "atm 手續費", category: "finance_insurance" },
];

/**
 * 找匹配 longest pattern 命中 → 該分類。
 * 大寫小寫不分（pattern + haystack 都 toLowerCase 比對）。
 */
export function classifyByMerchant(merchant: string): ExpenseCategory {
  const hay = merchant.toLowerCase();
  // 依 pattern 長度降序排，避免「咖啡」誤命中比「星巴克咖啡」更短的關鍵字
  const sorted = [...MERCHANT_CATEGORY_MAP].sort(
    (a, b) => b.pattern.length - a.pattern.length
  );
  for (const { pattern, category } of sorted) {
    if (hay.includes(pattern.toLowerCase())) return category;
  }
  return "other";
}

/* ─────────────────── Dedup 鍵 + 比對 ─────────────────── */

/**
 * 用 (date, amount, 標準化 description) 組合產生 dedup key。
 * description normalize：去空白 / 標點 / lowercase — 比對寬鬆但不會誤判
 * 兩家不同店為同筆。
 */
export function computeDedupKey(
  date: string,
  amount: number,
  description: string
): string {
  const normDesc = description
    .toLowerCase()
    .replace(/[\s\(\)\-\_\.,，。·・]+/g, "");
  return `${date}|${amount.toFixed(2)}|${normDesc}`;
}

/* ─────────────────── 主入口：parseAndClassify ─────────────────── */

interface ParseInput {
  csvText: string;
  /** 既有 DB transactions 的 dedup key 集合 — 用來標記重複 */
  existingKeys: Set<string>;
}

export interface ParseResult {
  format: BankFormat;
  rows: ParsedRow[];
  /** parser 整段失敗（檔案空 / 沒 header 欄位）會回 error */
  error?: string;
}

export function parseAndClassify({
  csvText,
  existingKeys,
}: ParseInput): ParseResult {
  const grid = parseCsv(csvText);
  if (grid.length < 2) {
    return {
      format: "generic",
      rows: [],
      error: "CSV 內容過少（至少需要 header + 1 行資料）",
    };
  }

  const headerRow = grid[0];
  const format = detectBankFormat(headerRow);
  const cols = detectColumns(headerRow, format);

  if (cols.date === -1 || cols.description === -1 || cols.amount === -1) {
    return {
      format,
      rows: [],
      error: `無法在 ${format.toUpperCase()} CSV 找到必要欄位（日期 / 摘要 / 金額）。請確認檔案是信用卡明細 CSV。`,
    };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    if (r.every((c) => !c)) continue; // 跳過全空行

    const rawDate = r[cols.date] ?? "";
    const rawDesc = r[cols.description] ?? "";
    const rawAmt = r[cols.amount] ?? "";

    const date = normalizeDate(rawDate);
    const description = rawDesc.trim();
    const amount = normalizeAmount(rawAmt);

    if (!date || !description || amount === 0) continue; // 無效 row

    const dedupKey = computeDedupKey(date, Math.abs(amount), description);
    const isDup = existingKeys.has(dedupKey);
    const isRefund = amount < 0;

    rows.push({
      date,
      description,
      amount: Math.abs(amount),
      suggestedCategory: classifyByMerchant(description),
      status: isRefund ? "refund" : isDup ? "duplicate" : "new",
      _dedupKey: dedupKey,
    });
  }

  return { format, rows };
}
