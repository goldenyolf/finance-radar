import {
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/expense-categories";

/**
 * 用 Gemini Flash 對單一記帳描述做大類分類。
 *
 * - 沒設 GEMINI_API_KEY → 回傳 null（呼叫方應 fallback 到關鍵字 classifier）
 * - 3 秒 timeout，避免拖住 LINE replyToken（生命週期約 1 分鐘但越快越好）
 * - 任何 fetch / parse 失敗 → 回傳 null，不拋例外
 *
 * 用 fetch 直打 Generative Language API，免裝 SDK 也不引入新依賴。
 */
const KEYS = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];
const KEY_SET = new Set<string>(KEYS);

const SYSTEM_PROMPT = `你是家庭記帳的分類助手。把輸入的記帳描述歸到以下七大類之一，
**只能**回覆其中一個 snake_case key，不要加任何標點、空白或解釋：
${KEYS.map((k) => `- ${k}（${EXPENSE_CATEGORY_LABEL[k]}）`).join("\n")}

判斷原則：
1. 「便當店」「孝親」「老家」「給媽媽」之類涉及長輩的 → eldercare
2. 「保母」「幼兒園」「奶粉」「尿布」「童裝」「玩具」 → childcare_education
3. 「午餐 / 晚餐 / 早餐 / 手搖 / 超市」 → food_dining
4. 「水電 / 瓦斯 / 衛生紙 / 管理費 / 家電」 → home_living
5. 「保險 / 醫療險 / 車險 / 儲蓄險」 → finance_insurance
6. 「加油 / 停車 / 高鐵 / 計程車 / eTag」 → transport
7. 其餘無法歸類 → other`;

export async function classifyByLlm(
  text: string
): Promise<ExpenseCategory | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text.trim()) return null;

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16,
          responseMimeType: "text/plain",
        },
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const cleaned = raw.toLowerCase().replace(/[^a-z_]/g, "");
    if (!KEY_SET.has(cleaned)) return null;
    return cleaned as ExpenseCategory;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
