/**
 * OpenAI Vision (gpt-4o) — 從發票 / 購物明細圖片擷取多筆消費項目。
 *
 * 設計重點：
 *   - 同樣走 fetch 直打 chat/completions，不裝 openai SDK
 *   - response_format: json_object 強制 LLM 回 JSON，省一輪解析失敗
 *   - prompt 明寫七大分類 key + 對應中文，把分類邏輯下放到 LLM
 *   - 一張發票通常 1-N 項，所以 schema 是 { items: InvoiceItem[] }
 */

import { parseKeywords, type CategoryRow } from "@/lib/categories";
import {
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/expense-categories";

const VISION_URL = "https://api.openai.com/v1/chat/completions";

const VALID_KEYS = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];
const VALID_KEY_SET = new Set<string>(VALID_KEYS);

export interface InvoiceItem {
  name: string;
  amount: number;
  category: ExpenseCategory;
}

export interface ExtractOptions {
  apiKey: string;
  /** 圖片 Buffer（從 LINE Data API 下載來的） */
  image: Buffer;
  /** LINE 回傳的 Content-Type，預設 "image/jpeg" */
  contentType?: string;
  /** 控制成本：gpt-4o 較準、gpt-4o-mini 較便宜。預設 gpt-4o。 */
  model?: string;
  /**
   * 使用者自訂 categories；提供時 prompt 會用使用者改過的名稱 / 關鍵字。
   * 不影響輸出 schema，輸出仍是 snake_case key（限制在 7 個內建 code）。
   */
  categories?: CategoryRow[];
}

const STATIC_SYSTEM_PROMPT = `你是家庭記帳系統的發票辨識助手。

使用者會傳一張發票或購物明細的照片。請仔細辨識並提取出所有消費項目。

【重要規則】
1. 每一筆項目必須分類到以下七大類之一（使用 snake_case key）：
${VALID_KEYS.map(
  (k) => `   - ${k.padEnd(22, " ")} (${EXPENSE_CATEGORY_LABEL[k]})`
).join("\n")}

2. 分類判斷原則：
   - 午餐 / 晚餐 / 便當 / 飲料 / 餐廳 / 全聯 / 超市買菜 → food_dining
   - 尿布 / 奶粉 / 童裝 / 玩具 / 幼兒園 / 托育 → childcare_education
   - 為長輩購買 / 孝親禮 / 原生家庭用品 → eldercare
   - 衛生紙 / 清潔用品 / 家電 / 家具 / 水電瓦斯 → home_living
   - 保險費 / 投資商品 → finance_insurance
   - 加油 / 停車 / 車票 / 計程車 → transport
   - 無法明確判斷 → other

3. 金額一律使用整數（不帶小數、不帶幣別符號），單位 TWD

4. name 欄位：商品名稱，最多 15 個字，過長請濃縮

5. 找不到任何品項時回傳 items: []

【回傳格式】
只能回 JSON，不加任何說明文字，schema 嚴格如下：
{
  "items": [
    { "name": "便當", "amount": 120, "category": "food_dining" },
    { "name": "衛生紙", "amount": 230, "category": "home_living" }
  ]
}`;

/**
 * 將使用者自訂 categories 編入 system prompt：
 * - 只列出 type='expense' && code !== null 的內建分類
 * - 名稱用使用者改過的 name；判斷規則用每個 category 的 keywords
 */
function buildDynamicPrompt(categories: CategoryRow[]): string {
  const builtIn = categories.filter(
    (c): c is CategoryRow & { code: string } =>
      c.type === "expense" && !!c.code && VALID_KEY_SET.has(c.code)
  );
  if (builtIn.length === 0) return STATIC_SYSTEM_PROMPT;

  const list = builtIn
    .map((c) => `   - ${c.code.padEnd(22, " ")} (${c.name})`)
    .join("\n");

  const rules = builtIn
    .map((c) => {
      const kws = parseKeywords(c.keywords);
      if (kws.length === 0) return null;
      const sample = kws.slice(0, 8).join(" / ");
      return `   - ${sample} → ${c.code}`;
    })
    .filter((line): line is string => line !== null)
    .join("\n");

  return `你是家庭記帳系統的發票辨識助手。

使用者會傳一張發票或購物明細的照片。請仔細辨識並提取出所有消費項目。

【重要規則】
1. 每一筆項目必須分類到以下類別之一（使用 snake_case key）：
${list}

2. 分類判斷原則（依使用者自訂關鍵字）：
${rules || "   - 依語意判斷"}
   - 無法明確判斷 → other

3. 金額一律使用整數（不帶小數、不帶幣別符號），單位 TWD

4. name 欄位：商品名稱，最多 15 個字，過長請濃縮

5. 找不到任何品項時回傳 items: []

【回傳格式】
只能回 JSON，不加任何說明文字，schema 嚴格如下：
{
  "items": [
    { "name": "便當", "amount": 120, "category": "food_dining" },
    { "name": "衛生紙", "amount": 230, "category": "home_living" }
  ]
}`;
}

export async function extractInvoiceItems({
  apiKey,
  image,
  contentType = "image/jpeg",
  model = "gpt-4o",
  categories,
}: ExtractOptions): Promise<InvoiceItem[]> {
  const base64 = image.toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;

  const systemPrompt = categories
    ? buildDynamicPrompt(categories)
    : STATIC_SYSTEM_PROMPT;

  const res = await fetch(VISION_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "請從這張圖片中擷取所有消費項目並分類。",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`Vision API ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  if (!raw) throw new Error("Vision API returned empty content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Vision API returned non-JSON: ${raw.slice(0, 100)}`);
  }

  return normalizeItems(parsed);
}

/**
 * 把 LLM 回傳的 unknown 結構收斂成 InvoiceItem[]：
 *   - 過濾 category 不在 enum 內的（fallback "other"）
 *   - 過濾 amount <= 0 或非數字的
 *   - 強制 name 是字串
 * 任何長得不像清單的回傳一律當作空陣列，給上層判 0 筆顯示錯誤。
 */
function normalizeItems(parsed: unknown): InvoiceItem[] {
  if (!parsed || typeof parsed !== "object") return [];
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  const result: InvoiceItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const obj = it as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    const amount =
      typeof obj.amount === "number"
        ? obj.amount
        : Number(obj.amount as string) || 0;
    const catRaw = typeof obj.category === "string" ? obj.category : "other";
    const category = (
      VALID_KEY_SET.has(catRaw) ? catRaw : "other"
    ) as ExpenseCategory;

    if (!name || !Number.isFinite(amount) || amount <= 0) continue;
    result.push({ name, amount: Math.round(amount), category });
  }
  return result;
}
