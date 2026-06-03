/**
 * LINE bot 訊息語意解析 — 動態 prompt + JSON 輸出 + 帳戶模糊比對。
 *
 * 取代純 regex 的 parseExpenseMessage 為主路徑：把 user 的 accounts/categories
 * 注入 prompt，讓 LLM 一次抽 {item, amount, account_override, category} 四欄。
 * 任何 LLM 失敗 (no API key / timeout / JSON parse 失敗 / amount 不合法) 都
 * 回 null，由 caller 退回 regex parser。
 *
 * 帳戶 fuzzy match：account_override 在 prompt 階段只擷取「user 打的關鍵字原文」
 * (如「中信」)，這個 module 再用三層分數比對映射到實際帳戶 id (如「百五的薪資
 * 帳戶 (中信)」)。
 */

import type { CategoryRow } from "@/lib/categories";
import type { AccountType, PaymentMethod } from "@/lib/dashboard";
import {
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/expense-categories";

export interface LineAccountContext {
  id: string;
  name: string;
  /** 帳戶 type（per 0012 migration），LLM prompt 用來提示「現金錢包」應走 cash payment。 */
  type: AccountType;
}

export interface LineLlmParseResult {
  item: string;
  amount: number;
  /** 模糊比對命中時為帳戶 id；LLM 沒抽到 override / 找不到對應 → null。 */
  accountId: string | null;
  /** 命中帳戶的顯示用 name；null = 沒覆蓋（caller 走 fallback chain）。 */
  accountLabel: string | null;
  /** LLM 推測的分類；不可信時 null，caller 自行走 keyword classifier。 */
  category: ExpenseCategory | null;
  /** 付款方式：LLM 必填三值之一（per Phase 3 prompt）。fallback 視 caller 決定。 */
  paymentMethod: PaymentMethod | null;
}

const CATEGORY_CODES = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];
const CATEGORY_CODE_SET = new Set<string>(CATEGORY_CODES);
const PAYMENT_METHOD_SET = new Set<string>([
  "cash",
  "credit_card",
  "transfer",
] satisfies PaymentMethod[]);

/** 帳戶 type → 中文標籤，用在 prompt 帳戶清單後綴。 */
const ACCOUNT_TYPE_HINT: Record<AccountType, string> = {
  cash: "現金錢包",
  credit_card: "信用卡",
  bank: "銀行帳戶（網銀/匯款）",
};

/* ─────────────────────── Prompt 組裝 ─────────────────────── */

/**
 * 動態組裝 system prompt：把該 user 的 accounts + categories 注入 LLM。
 *
 * 為什麼 account_override 只要原文不要 id：
 *   - LLM 看到「台新」可能會自作主張寫成「生活支出共同帳戶 (台新)」full name，
 *     但模型對長字串容易漂移；要它原樣 echo 「台新」反而最穩。
 *   - id 比對交給 code 端的 matchAccount，可控、可測、零幻覺風險。
 */
export function buildLineParsePrompt(
  accounts: LineAccountContext[],
  categories: CategoryRow[]
): string {
  const expenseCats = categories.filter(
    (c): c is CategoryRow & { code: string } =>
      c.type === "expense" && !!c.code && CATEGORY_CODE_SET.has(c.code)
  );

  const accountList =
    accounts.length > 0
      ? accounts
          .map((a) => `  - "${a.name}" → ${ACCOUNT_TYPE_HINT[a.type]}`)
          .join("\n")
      : "  （該使用者尚未建立任何帳戶）";

  const categoryList =
    expenseCats.length > 0
      ? expenseCats.map((c) => `  - ${c.code}（${c.name}）`).join("\n")
      : CATEGORY_CODES.map(
          (k) => `  - ${k}（${EXPENSE_CATEGORY_LABEL[k]}）`
        ).join("\n");

  return `你是 Money Radar 家庭記帳的解析助手。從一句口語記帳訊息中抽出結構化欄位。

【可用帳戶清單】（使用者打的可能只是縮寫或關鍵字，例如「台新」「中信」「郵局」）：
${accountList}

【可用支出分類 code】：
${categoryList}

【輸出規格】嚴格 JSON，**禁止** markdown code fence、**禁止**任何解釋文字。Schema：
{
  "item": string,                          // 消費項目（去掉金額與帳戶關鍵字後的核心描述）
  "amount": number,                        // 純數字，不含貨幣符號或單位
  "account_override": string | null,       // 訊息中**明確提到**的帳戶關鍵字原文，例如「台新」「中信」「郵局」；若未提及一律 null
  "category": string | null,               // 上列分類 code 之一；判斷不出來填 null
  "payment_method": "cash" | "credit_card" | "transfer"  // 必填三選一，依下方規則判斷
}

【判斷原則】
1. account_override 只擷取**使用者打的原始關鍵字**，不要自己擴寫成完整名稱。例：「晚餐 500 台新」→ "台新"，**不是** "生活支出共同帳戶 (台新)"。
   ► item 必須把「帳戶關鍵字」整段拿掉（含前後空白），但**保留**括弧內的情境補充（例：「（請家人喝）」「(老家)」「（生日）」）— 那是消費的描述細節，不是帳戶。
2. 若訊息**完全沒提到**任何帳戶相關詞，account_override 一定要是 null。寧可漏抓，不要硬猜。
3. amount 必為正數。找不到合理金額就回 0（呼叫端會視為解析失敗）。
4. category 嚴格只能是上列 code 之一，否則填 null。
5. 「請 X 喝/吃」「給 X 買」這類修飾語**不改變分類本質** — 仍依消費物品本身判斷。例：「請家人喝咖啡」「買便當給同事」都是 food_dining，不是 other。
6. 咖啡 / 茶 / 手搖 / 麵包 / 蛋糕 / 飲料 / Cama / 星巴克 / 路易莎 等飲食店家或品項一律 food_dining。

【payment_method 判定流程】（依序檢查，命中即定）
A. 出現「刷 / 卡 / 信用卡 / 信」這類字 → "credit_card"
B. 出現「轉 / 匯 / 網銀 / 匯款 / ATM」這類字 → "transfer"
C. 項目本身是高額固定支出（房貸 / 房租 / 學費 / 保費 / 水電 / 瓦斯 / 電費）→ "transfer"（這類在台灣 99% 走銀行轉帳或扣繳）
D. 出現「現 / 現金」這類字 → "cash"
E. 若 account_override 明確指向某帳戶，依該帳戶 type 對應：現金錢包→cash、信用卡→credit_card、銀行帳戶→transfer
F. 以上皆無線索 → "cash"（小額日常消費的合理預設）

【範例】
輸入：「晚餐 500 台新」
輸出：{"item":"晚餐","amount":500,"account_override":"台新","category":"food_dining","payment_method":"transfer"}

輸入：「午餐 120」
輸出：{"item":"午餐","amount":120,"account_override":null,"category":"food_dining","payment_method":"cash"}

輸入：「吃午餐 100」
輸出：{"item":"吃午餐","amount":100,"account_override":null,"category":"food_dining","payment_method":"cash"}

輸入：「繳房貸 25000」
輸出：{"item":"繳房貸","amount":25000,"account_override":null,"category":"home_living","payment_method":"transfer"}

輸入：「刷卡買鞋 1980」
輸出：{"item":"買鞋","amount":1980,"account_override":null,"category":"other","payment_method":"credit_card"}

輸入：「中信 加油 1200」
輸出：{"item":"加油","amount":1200,"account_override":"中信","category":"transport","payment_method":"transfer"}

輸入：「現金 早餐 60」
輸出：{"item":"早餐","amount":60,"account_override":null,"category":"food_dining","payment_method":"cash"}

輸入：「網銀繳電費 1850」
輸出：{"item":"繳電費","amount":1850,"account_override":null,"category":"home_living","payment_method":"transfer"}

輸入：「台新 Cama 咖啡（請家人喝）542」
輸出：{"item":"Cama 咖啡（請家人喝）","amount":542,"account_override":"台新","category":"food_dining","payment_method":"transfer"}

輸入：「（郵局）幼兒園學費 8500」
輸出：{"item":"幼兒園學費","amount":8500,"account_override":"郵局","category":"childcare_education","payment_method":"transfer"}`;
}

/* ─────────────────────── LLM 呼叫 ─────────────────────── */

interface CallParams {
  text: string;
  accounts: LineAccountContext[];
  categories: CategoryRow[];
}

interface LlmRawJson {
  item?: unknown;
  amount?: unknown;
  account_override?: unknown;
  category?: unknown;
  payment_method?: unknown;
}

/**
 * 打 Gemini Flash 拿 JSON。3.5s timeout (LINE replyToken 60s 但越快越好)，
 * 任何錯誤都回 null —— 由 caller 退回 regex parser，整條 pipeline 不會崩。
 *
 * 沿用既有 GEMINI_API_KEY / GEMINI_MODEL env，避免引入新依賴 / 新 secret。
 */
export async function parseLineMessageWithLlm(
  params: CallParams
): Promise<LineLlmParseResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !params.text.trim()) return null;

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const systemPrompt = buildLineParsePrompt(params.accounts, params.categories);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: params.text }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 256,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!raw) return null;

    const parsed = safeJsonParse(raw);
    if (!parsed) return null;

    return normalizeLlmOutput(parsed, params.accounts);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function safeJsonParse(raw: string): LlmRawJson | null {
  // Gemini 偶爾仍會包 ```json ... ``` fence —— 容忍剝殼
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as LlmRawJson;
  } catch {
    return null;
  }
}

function normalizeLlmOutput(
  raw: LlmRawJson,
  accounts: LineAccountContext[]
): LineLlmParseResult | null {
  const item = typeof raw.item === "string" ? raw.item.trim() : "";
  const amountNum =
    typeof raw.amount === "number"
      ? raw.amount
      : Number(typeof raw.amount === "string" ? raw.amount : NaN);
  if (!item || !Number.isFinite(amountNum) || amountNum <= 0) return null;

  const overrideRaw =
    typeof raw.account_override === "string"
      ? raw.account_override.trim()
      : "";
  const matched = overrideRaw ? matchAccount(overrideRaw, accounts) : null;

  const catRaw =
    typeof raw.category === "string"
      ? raw.category.trim().toLowerCase()
      : "";
  const category =
    catRaw && CATEGORY_CODE_SET.has(catRaw)
      ? (catRaw as ExpenseCategory)
      : null;

  // payment_method：prompt 要求必填三值之一，但 LLM 偶爾還是會漂；
  // 守備：不在 enum 集合內一律 null，交給 webhook fallback 處理。
  const pmRaw =
    typeof raw.payment_method === "string"
      ? raw.payment_method.trim().toLowerCase()
      : "";
  const paymentMethod =
    pmRaw && PAYMENT_METHOD_SET.has(pmRaw) ? (pmRaw as PaymentMethod) : null;

  return {
    item,
    amount: amountNum,
    accountId: matched?.id ?? null,
    accountLabel: matched?.name ?? null,
    category,
    paymentMethod,
  };
}

/* ─────────────────────── 帳戶模糊比對 ─────────────────────── */

/**
 * 把 override 字串對到 user 的某個帳戶。沒命中回 null。
 *
 * 分數階梯（高 → 低）：
 *   100 完全等於（normalize 後）
 *    80 帳戶 name 完整包含 override（典型：「中信」⊂「百五的薪資帳戶 (中信)」）
 *    60 override 完整包含 name（user 打多、帳戶名很短）
 *    40 override 前 2-3 字 ⊂ name（保底：抗錯字、抗同義詞如「中國信託」vs「中信」）
 *
 * 同分時取 id 字典序較前，行為可重現。
 *
 * 也可直接 export 給 regex fallback path 使用（webhook 端的安全網）。
 */
export function matchAccount(
  override: string,
  accounts: LineAccountContext[]
): LineAccountContext | null {
  const needle = normalizeForMatch(override);
  if (!needle) return null;

  let best: { acc: LineAccountContext; score: number } | null = null;
  for (const acc of accounts) {
    const hay = normalizeForMatch(acc.name);
    const score = scoreMatch(needle, hay);
    if (score <= 0) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && acc.id < best.acc.id)
    ) {
      best = { acc, score };
    }
  }
  return best?.acc ?? null;
}

function normalizeForMatch(s: string): string {
  // 去掉所有括弧、空白、底線、標點、底線 ─ 留純文字 + 數字。
  return s
    .toLowerCase()
    .replace(/[（）()【】\[\]\s·・,，.。_\-]+/g, "");
}

function scoreMatch(needle: string, hay: string): number {
  if (!needle || !hay) return 0;
  if (needle === hay) return 100;
  if (hay.includes(needle)) return 80;
  if (needle.includes(hay)) return 60;
  if (needle.length >= 2 && hay.length >= 2) {
    const core = needle.length <= 3 ? needle : needle.slice(0, 3);
    if (hay.includes(core)) return 40;
  }
  return 0;
}
