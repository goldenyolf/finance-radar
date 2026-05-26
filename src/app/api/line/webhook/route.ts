import { NextResponse, type NextRequest } from "next/server";
import {
  validateSignature,
  messagingApi,
  type webhook,
} from "@line/bot-sdk";

import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/dashboard";
import {
  classifyByKeyword,
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/expense-categories";
import { classifyByLlm } from "@/lib/llm-classify";
import { budgetKey } from "@/lib/system-settings";

export const runtime = "nodejs";

const DEFAULT_USER_ID = "user-001";
const PERSONAL_ACCOUNT_ID = "acc-001";       // 中信（百五個人）
const SHARED_ACCOUNT_ID = "acc-taishin";     // 台新共同戶

/**
 * 帳戶關鍵字：掃整段字串（不限位置、可被括弧包住）。命中第一個即停。
 * 順序代表優先級：台新／共同／家庭 → 共同戶；中信 → 個人戶。
 * 未來要加 郵局 / 合庫 等，需先在上方宣告對應的 accountId 常數。
 */
const ACCOUNT_KEYWORDS: Array<{
  keyword: string;
  accountId: string;
  label: string;
}> = [
  { keyword: "台新", accountId: SHARED_ACCOUNT_ID, label: "台新共同" },
  { keyword: "共同", accountId: SHARED_ACCOUNT_ID, label: "台新共同" },
  { keyword: "家庭", accountId: SHARED_ACCOUNT_ID, label: "台新共同" },
  { keyword: "中信", accountId: PERSONAL_ACCOUNT_ID, label: "中信" },
];

type ParsedEntry = {
  amount: number;
  title: string;
  accountId: string;
  accountLabel: string;
};

/**
 * 從 LINE 文字訊息抽出 {amount, title, accountId}。三段式：
 *   1) 帳戶：indexOf 掃全段（修 Bug 2，過去只看 startsWith 抓不到「（台新）」）
 *   2) 金額：優先「N 元/塊」「$N」「NT$N」，最後才退到「末端獨立整數」
 *      （修 Bug 1，過去 /\d+/ 第一個贏，1TB 的 1 會吃掉 9150）
 *   3) 標題：剩下的文字 trim
 */
function parseExpenseMessage(text: string): ParsedEntry | null {
  let working = text.trim();
  if (!working) return null;

  // ── 1. 帳戶偵測（不限位置；連同緊鄰的全形/半形括弧一起吃掉，避免污染標題） ──
  let accountId = PERSONAL_ACCOUNT_ID;
  let accountLabel = "中信";
  for (const { keyword, accountId: id, label } of ACCOUNT_KEYWORDS) {
    if (!working.includes(keyword)) continue;
    accountId = id;
    accountLabel = label;
    working = working.replace(
      new RegExp(`[（(]?\\s*${keyword}\\s*[)）]?`),
      " "
    );
    break;
  }

  // ── 2. 金額擷取 ──
  const amountResult = extractAmount(working);
  if (!amountResult) return null;

  // ── 3. 標題：working 移除金額匹配後 trim ──
  const title = working
    .replace(amountResult.matchText, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return null;

  return {
    amount: amountResult.amount,
    title,
    accountId,
    accountLabel,
  };
}

function extractAmount(
  text: string
): { amount: number; matchText: string } | null {
  // (a) 帶中文貨幣後綴：「9150 元」「200塊」 — 最高優先級
  const cnSuffix = text.match(/(\d+(?:\.\d+)?)\s*(?:元|塊)/);
  if (cnSuffix) {
    const v = Number(cnSuffix[1]);
    if (Number.isFinite(v) && v > 0) {
      return { amount: v, matchText: cnSuffix[0] };
    }
  }

  // (b) $ / NT$ 前綴
  const dollarPrefix = text.match(/(?:NT)?\$\s*(\d+(?:\.\d+)?)/i);
  if (dollarPrefix) {
    const v = Number(dollarPrefix[1]);
    if (Number.isFinite(v) && v > 0) {
      return { amount: v, matchText: dollarPrefix[0] };
    }
  }

  // (c) 退路：取「最後一個獨立整數」。前後都不能緊鄰字母/中文/星號，
  //    避免 1TB*2 的 1 跟 2 被誤判為金額。
  const candidates = [
    ...text.matchAll(
      /(?<![\dA-Za-z一-鿿*])(\d+(?:\.\d+)?)(?![A-Za-z一-鿿*])/g
    ),
  ];
  if (candidates.length === 0) return null;
  const last = candidates[candidates.length - 1];
  const v = Number(last[1]);
  if (!Number.isFinite(v) || v <= 0) return null;
  return { amount: v, matchText: last[0] };
}

function todayInTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelSecret || !channelAccessToken) {
    console.error("[LINE webhook] 缺少 LINE_CHANNEL_SECRET 或 LINE_CHANNEL_ACCESS_TOKEN");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";

  if (!validateSignature(rawBody, channelSecret, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: webhook.CallbackRequest;
  try {
    body = JSON.parse(rawBody) as webhook.CallbackRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const client = new messagingApi.MessagingApiClient({ channelAccessToken });

  await Promise.all(
    (body.events ?? []).map((event) => handleEvent(event, client))
  );

  return NextResponse.json({ ok: true });
}

async function handleEvent(
  event: webhook.Event,
  client: messagingApi.MessagingApiClient
): Promise<void> {
  if (event.type !== "message") return;
  const messageEvent = event as webhook.MessageEvent;
  if (messageEvent.message.type !== "text") return;
  if (!messageEvent.replyToken) return;

  const text = (messageEvent.message as webhook.TextMessageContent).text;
  const replyToken = messageEvent.replyToken;

  const parsed = parseExpenseMessage(text);
  if (!parsed) {
    await replyText(
      client,
      replyToken,
      "💡 記帳格式錯誤囉！\n• 個人（中信）：午餐 120\n• 共同（台新）：共同 牛奶 80"
    );
    return;
  }

  const category = await classifyExpense(parsed.title);
  const categoryLabel = EXPENSE_CATEGORY_LABEL[category];

  try {
    const { error } = await supabase.from("transactions").insert({
      user_id: DEFAULT_USER_ID,
      account_id: parsed.accountId,
      description: parsed.title,
      amount: parsed.amount,
      type: "expense",
      priority: "non_essential",
      category,
      status: "completed",
      date: todayInTaipei(),
    });

    if (error) {
      console.error("[LINE webhook] Supabase insert error:", error);
      await replyText(client, replyToken, "❌ 記帳失敗，請稍後再試或檢查系統日誌。");
      return;
    }

    // 記帳成功後，順便檢查該分類本月預算是否爆表，附加警報到回覆尾端。
    // 失敗（網路 / DB error）不影響記帳本身，warning = "" 而已。
    const warning = await buildBudgetWarning(category);

    await replyText(
      client,
      replyToken,
      `✅ 已成功記帳：[${categoryLabel}] ${parsed.title} $${parsed.amount}（${parsed.accountLabel}）${warning}`
    );
  } catch (err) {
    console.error("[LINE webhook] Unexpected error:", err);
    await replyText(client, replyToken, "❌ 記帳失敗，請稍後再試或檢查系統日誌。");
  }
}

/**
 * 取得本月第一天的 ISO date（Asia/Taipei）。
 * 跟 todayInTaipei() 同套時區處理，避免跨日 / 跨月誤差。
 */
function monthStartInTaipei(): string {
  return todayInTaipei().slice(0, 7) + "-01";
}

/**
 * 檢查某分類本月已花費是否撞到 system_settings 設定的預算上限。
 * - 沒設預算或預算 <= 0 → 不警告（回空字串）
 * - 用 >= 100% → ⚠️ 警告
 * - 用 >= 80%  → 💡 提示
 * - 'other' 分類沒預算概念，直接 skip
 *
 * 統計範圍：跨所有帳戶、本月、type='expense'、status='completed'。
 * 因為 budget 本身就是 per-category 全域設定，spending 也要對齊範圍才合理。
 *
 * 任何 DB 錯誤都靜默 fallback 成「不警告」，不影響記帳主流程。
 */
async function buildBudgetWarning(
  category: ExpenseCategory
): Promise<string> {
  if (category === "other") return "";

  try {
    const { data: settingRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", budgetKey(category))
      .maybeSingle();
    if (!settingRow) return "";

    const budget = Number(settingRow.value);
    if (!Number.isFinite(budget) || budget <= 0) return "";

    const monthStart = monthStartInTaipei();
    const { data: txns } = await supabase
      .from("transactions")
      .select("amount")
      .eq("type", "expense")
      .eq("status", "completed")
      .eq("category", category)
      .gte("date", monthStart);

    const total = (txns ?? []).reduce(
      (sum, t) => sum + Number(t.amount),
      0
    );
    const pct = (total / budget) * 100;
    const label = EXPENSE_CATEGORY_LABEL[category];

    if (total >= budget) {
      return `\n\n⚠️ 警告：本月 [${label}] 已花費 ${formatCurrency(total)}，超過預算上限 ${formatCurrency(budget)}！請立刻克制消費！`;
    }
    if (pct >= 80) {
      return `\n\n💡 提示：本月 [${label}] 預算已達 ${pct.toFixed(0)}%（${formatCurrency(total)} / ${formatCurrency(budget)}），快到天花板囉！`;
    }
    return "";
  } catch (err) {
    console.error("[LINE webhook] budget warning check failed:", err);
    return "";
  }
}

/**
 * 兩段式分類：先用關鍵字（快、免費、deterministic），
 * 命中 'other' 時若有 GEMINI_API_KEY 才打 LLM 補上。
 */
async function classifyExpense(title: string): Promise<ExpenseCategory> {
  const keyword = classifyByKeyword(title);
  if (keyword !== "other") return keyword;
  const llm = await classifyByLlm(title);
  return llm ?? "other";
}

async function replyText(
  client: messagingApi.MessagingApiClient,
  replyToken: string,
  text: string
): Promise<void> {
  try {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text }],
    });
  } catch (err) {
    console.error("[LINE webhook] Reply failed:", err);
  }
}
