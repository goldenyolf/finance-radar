import { NextResponse, type NextRequest } from "next/server";
import {
  validateSignature,
  messagingApi,
  type webhook,
} from "@line/bot-sdk";

import { createServiceClient } from "@/lib/supabase/service";
import { formatCurrency } from "@/lib/dashboard";
import {
  classifyByKeyword,
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/expense-categories";
import { downloadLineMedia } from "@/lib/line-media";
import { classifyByLlm } from "@/lib/llm-classify";
import { extractInvoiceItems, type InvoiceItem } from "@/lib/openai-vision";
import { transcribeAudio } from "@/lib/openai-whisper";
import { budgetKey } from "@/lib/system-settings";

export const runtime = "nodejs";

// Lazy service client — 不在 module load 期間建（否則 build 階段 collect
// page data 會因為沒 SUPABASE_SERVICE_ROLE_KEY 而崩）。同一 worker 內建一
// 次後續重用，無 session 狀態跨 request 安全。
let _supabase: ReturnType<typeof createServiceClient> | null = null;
function db() {
  if (!_supabase) _supabase = createServiceClient();
  return _supabase;
}

// TODO multi-tenant：目前帳戶 ID 還是寫死「acc-001 / acc-taishin」，
// 假設只有 Austin（最早期使用者）綁了 LINE。若未來有其他會員綁 LINE，
// 需改成從各自的 accounts 表撈他們自己的 acc 對應；現階段保留是因為
// 只有一位 LINE 綁定者。
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

/* ─────────────── Goal deposit intent parsing ─────────────── */

interface GoalIntent {
  amount: number;
  /** 訊息中 explicit 指定的目標名（「到 XXX」後面那段）；null = 沒指定 */
  goalNameHint: string | null;
}

/**
 * 偵測「提撥 / 夢想基金 / 存入夢想」這類關鍵字，並擷取金額 + 可選目標名。
 * 沒命中關鍵字直接回 null，由呼叫端走原本的支出 flow。
 *
 * 支援的句型：
 *   - "存入夢想基金 2000"
 *   - "提撥 500 到迪士尼之旅"
 *   - "夢想基金 +500"
 *   - "提撥 1000"
 */
function parseGoalMessage(text: string): GoalIntent | null {
  if (!/夢想|提撥/.test(text)) return null;
  const amt = extractAmount(text);
  if (!amt) return null;

  let goalNameHint: string | null = null;
  // 「到 XXX」中的 XXX — 抓到下一個空白/數字/$ 結束
  const hintMatch = text.match(/到\s*([^\d\s$]{1,20})/);
  if (hintMatch) goalNameHint = hintMatch[1].trim();

  return { amount: amt.amount, goalNameHint };
}

/**
 * 試著當作夢想提撥處理。回 true 表示已處理完（不論成功失敗都回了 LINE 訊息），
 * 呼叫端就不要再走 expense flow；回 false 代表「這不是夢想訊息」交給後面。
 */
async function tryGoalDeposit(
  text: string,
  userId: string,
  client: messagingApi.MessagingApiClient,
  replyToken: string,
  replyPrefix: string
): Promise<boolean> {
  const intent = parseGoalMessage(text);
  if (!intent) return false;

  // 撈這位使用者的 goals 找最佳匹配（service client 沒 auth，要顯式 filter）
  const { data: goals, error } = await db()
    .from("goals")
    .select("id, name, current_amount, target_amount")
    .eq("user_id", userId);
  if (error) {
    console.error("[LINE webhook] goals fetch failed:", error);
    await replyText(
      client,
      replyToken,
      `${replyPrefix}❌ 抓不到夢想清單，請稍後再試。`
    );
    return true;
  }
  if (!goals || goals.length === 0) {
    await replyText(
      client,
      replyToken,
      `${replyPrefix}⚠️ 還沒設定任何夢想，請先到網頁建立目標再提撥。`
    );
    return true;
  }

  // 名字模糊比對：包含 hint OR hint 包含 name；fallback 第一個
  let target = goals[0];
  if (intent.goalNameHint) {
    const matched = goals.find(
      (g) =>
        g.name.includes(intent.goalNameHint!) ||
        intent.goalNameHint!.includes(g.name)
    );
    if (matched) target = matched;
  }

  const current = Number(target.current_amount);
  const targetAmount = Number(target.target_amount);
  const newAmount = current + intent.amount;
  const justCompleted = current < targetAmount && newAmount >= targetAmount;

  // 更新累積金額
  const { error: updateErr } = await db()
    .from("goals")
    .update({ current_amount: newAmount })
    .eq("id", target.id);
  if (updateErr) {
    console.error("[LINE webhook] goal update failed:", updateErr);
    await replyText(
      client,
      replyToken,
      `${replyPrefix}❌ 寫入失敗：${updateErr.message}`
    );
    return true;
  }

  // 寫 log（失敗不擋主流程）
  const { error: logErr } = await db().from("goal_logs").insert({
    goal_id: target.id,
    user_id: userId,
    amount: intent.amount,
  });
  if (logErr) console.error("[LINE webhook] goal log insert failed:", logErr);

  const pct = (newAmount / targetAmount) * 100;
  const baseMsg = `🌟 太棒了！已為【${target.name}】注入 $${intent.amount} 能量，目前進度已達 ${pct.toFixed(0)}%！加油！`;
  const completedMsg = justCompleted
    ? `\n\n🎉 夢想 100% 達成！恭喜，準備好出發了嗎？`
    : "";
  await replyText(client, replyToken, `${replyPrefix}${baseMsg}${completedMsg}`);
  return true;
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
  if (!messageEvent.replyToken) return;
  const replyToken = messageEvent.replyToken;

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

  try {
    // ── 多租戶身份解析：LINE userId → profiles → Supabase user_id ──
    const lineUserId = event.source?.userId;
    if (!lineUserId) {
      await safeReply(
        client,
        replyToken,
        "⚠️ 無法識別你的 LINE 帳號，請確認對話來源後再試。"
      );
      return;
    }

    const { data: profile, error: profileErr } = await db()
      .from("profiles")
      .select("user_id")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    if (profileErr) {
      console.error("[LINE webhook] profile lookup failed:", profileErr);
      await safeReply(client, replyToken, "❌ 系統繁忙，請稍後再試。");
      return;
    }

    if (!profile) {
      await safeReply(
        client,
        replyToken,
        "⚠️ 您的 LINE 帳號尚未綁定 Money Radar 會員，請先至網頁端『系統設定』完成綁定才能開始記帳喔！"
      );
      return;
    }

    const userId = profile.user_id as string;

    switch (messageEvent.message.type) {
      case "text": {
        const text = (messageEvent.message as webhook.TextMessageContent).text;
        await handleTextMessage(text, userId, client, replyToken);
        return;
      }
      case "audio": {
        const messageId = messageEvent.message.id;
        await handleAudioMessage(
          messageId,
          userId,
          channelAccessToken,
          client,
          replyToken
        );
        return;
      }
      case "image": {
        const messageId = messageEvent.message.id;
        await handleImageMessage(
          messageId,
          userId,
          channelAccessToken,
          client,
          replyToken
        );
        return;
      }
      default:
        // sticker / location / video / file 等暫不支援
        return;
    }
  } catch (err) {
    console.error("[LINE webhook] Unhandled error in dispatcher:", err);
    await safeReply(
      client,
      replyToken,
      "❌ 系統發生未預期錯誤，請稍後再試。"
    );
  }
}

/* ─────────────────────────── Text ─────────────────────────── */

/**
 * 文字訊息核心邏輯。也被 audio handler 在 Whisper 轉錄後重用 — 因此抽成
 * 獨立函式，加 prefix 參數讓 audio 能在回覆前加「🎙️ 語音辨識成功」。
 *
 * 流程：先試 goal deposit（夢想基金提撥）→ 沒命中再走 expense 記帳。
 */
async function handleTextMessage(
  text: string,
  userId: string,
  client: messagingApi.MessagingApiClient,
  replyToken: string,
  replyPrefix: string = ""
): Promise<void> {
  // 1. 先試夢想基金提撥
  const goalHandled = await tryGoalDeposit(text, userId, client, replyToken, replyPrefix);
  if (goalHandled) return;

  // 2. 走原本的支出記帳
  const parsed = parseExpenseMessage(text);
  if (!parsed) {
    await replyText(
      client,
      replyToken,
      `${replyPrefix}💡 記帳格式錯誤囉！\n• 個人（中信）：午餐 120\n• 共同（台新）：共同 牛奶 80`
    );
    return;
  }

  const category = await classifyExpense(parsed.title);
  const categoryLabel = EXPENSE_CATEGORY_LABEL[category];

  try {
    const { error } = await db().from("transactions").insert({
      user_id: userId,
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
      await replyText(
        client,
        replyToken,
        `${replyPrefix}❌ 記帳失敗，請稍後再試或檢查系統日誌。`
      );
      return;
    }

    const warning = await buildBudgetWarning(userId, category);
    await replyText(
      client,
      replyToken,
      `${replyPrefix}✅ 已成功記帳：[${categoryLabel}] ${parsed.title} $${parsed.amount}（${parsed.accountLabel}）${warning}`
    );
  } catch (err) {
    console.error("[LINE webhook] Unexpected error:", err);
    await replyText(
      client,
      replyToken,
      `${replyPrefix}❌ 記帳失敗，請稍後再試或檢查系統日誌。`
    );
  }
}

/* ─────────────────────────── Audio (Whisper STT) ─────────────────────────── */

/**
 * Audio → Whisper STT → 餵給文字解析鏈，用 replyPrefix 加上「🎙️ 語音辨識成功：原話」。
 * 任何一步失敗都回友善訊息，不讓 webhook 整個崩潰。
 */
async function handleAudioMessage(
  messageId: string,
  userId: string,
  channelAccessToken: string,
  client: messagingApi.MessagingApiClient,
  replyToken: string
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await replyText(
      client,
      replyToken,
      "⚠️ 尚未設定 OPENAI_API_KEY，目前不支援語音記帳。請改用文字訊息。"
    );
    return;
  }

  let transcript: string;
  try {
    const { buffer, contentType } = await downloadLineMedia(
      messageId,
      channelAccessToken
    );
    transcript = await transcribeAudio({
      apiKey,
      audio: buffer,
      contentType,
    });
  } catch (err) {
    console.error("[LINE webhook] audio pipeline failed:", err);
    await replyText(
      client,
      replyToken,
      "❌ 語音辨識失敗，請改用文字訊息重新記帳。"
    );
    return;
  }

  const prefix = `🎙️ 語音辨識成功：「${transcript}」\n\n`;
  await handleTextMessage(transcript, userId, client, replyToken, prefix);
}

/* ─────────────────────────── Image (Vision LLM) ─────────────────────────── */

/**
 * Image → Vision LLM → 可能多筆 InvoiceItem → 批次寫入 supabase →
 * 多行條列式 LINE 回覆。
 *
 * 圖片沒有「帳戶」上下文（LINE image 不能附 caption），所以一律寫到
 * personal 帳戶。要記到共同戶請改用文字「共同 ... 金額」格式。
 */
async function handleImageMessage(
  messageId: string,
  userId: string,
  channelAccessToken: string,
  client: messagingApi.MessagingApiClient,
  replyToken: string
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await replyText(
      client,
      replyToken,
      "⚠️ 尚未設定 OPENAI_API_KEY，目前不支援發票記帳。請改用文字訊息。"
    );
    return;
  }

  let items: InvoiceItem[];
  try {
    const { buffer, contentType } = await downloadLineMedia(
      messageId,
      channelAccessToken
    );
    items = await extractInvoiceItems({
      apiKey,
      image: buffer,
      contentType,
    });
  } catch (err) {
    console.error("[LINE webhook] image pipeline failed:", err);
    await replyText(
      client,
      replyToken,
      "❌ 發票辨識失敗，請改用文字訊息記帳或重拍清晰一點。"
    );
    return;
  }

  if (items.length === 0) {
    await replyText(
      client,
      replyToken,
      "🤔 沒辨識到任何消費項目，請確認圖片是否為發票或購物明細。"
    );
    return;
  }

  // 批次寫入 — supabase.insert 接受 array 自動 batch
  const today = todayInTaipei();
  const rows = items.map((item) => ({
    user_id: userId,
    account_id: PERSONAL_ACCOUNT_ID, // 圖片沒帳戶 context，預設記到個人
    description: item.name,
    amount: item.amount,
    type: "expense" as const,
    priority: "non_essential" as const,
    category: item.category,
    status: "completed" as const,
    date: today,
  }));

  try {
    const { error } = await db().from("transactions").insert(rows);
    if (error) {
      console.error("[LINE webhook] batch insert error:", error);
      await replyText(
        client,
        replyToken,
        `❌ 辨識到 ${items.length} 筆但寫入資料庫失敗，請稍後再試。`
      );
      return;
    }
  } catch (err) {
    console.error("[LINE webhook] batch insert unexpected error:", err);
    await replyText(
      client,
      replyToken,
      `❌ 辨識到 ${items.length} 筆但寫入失敗。`
    );
    return;
  }

  // 多筆預算警報：抓有預算的分類，逐一檢查，但別發太多條（取前 3 條最緊張的）
  const warnings = await collectBudgetWarnings(userId, items);

  // 組合回覆
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const lines = items.map(
    (i, idx) =>
      `${idx + 1}. [${EXPENSE_CATEGORY_LABEL[i.category]}] ${i.name} $${i.amount}`
  );

  const reply = [
    `✅ 發票解析成功！共記下 ${items.length} 筆帳：`,
    ...lines,
    `總計：$${total}`,
    ...(warnings.length > 0 ? ["", ...warnings] : []),
  ].join("\n");

  await replyText(client, replyToken, reply);
}

/**
 * 對發票多筆項目，把同分類加總後一次性檢查預算。回傳警告字串陣列。
 * 為避免 LINE 訊息爆炸，最多顯示 3 條最嚴重的。
 */
async function collectBudgetWarnings(
  userId: string,
  items: InvoiceItem[]
): Promise<string[]> {
  const byCategory = new Map<ExpenseCategory, number>();
  for (const it of items) {
    byCategory.set(it.category, (byCategory.get(it.category) ?? 0) + it.amount);
  }
  const warnings: string[] = [];
  for (const cat of byCategory.keys()) {
    const w = await buildBudgetWarning(userId, cat);
    if (w) warnings.push(w.trim());
  }
  return warnings.slice(0, 3);
}

/**
 * 想 replyText 但又怕 client 拋出 — 多包一層 safety net 給 catch-all 用。
 */
async function safeReply(
  client: messagingApi.MessagingApiClient,
  replyToken: string,
  text: string
): Promise<void> {
  try {
    await replyText(client, replyToken, text);
  } catch (err) {
    console.error("[LINE webhook] safeReply also failed:", err);
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
  userId: string,
  category: ExpenseCategory
): Promise<string> {
  if (category === "other") return "";

  try {
    // service client 沒 RLS context，所有查詢都要顯式 .eq("user_id", ...)
    const { data: settingRow } = await db()
      .from("system_settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", budgetKey(category))
      .maybeSingle();
    if (!settingRow) return "";

    const budget = Number(settingRow.value);
    if (!Number.isFinite(budget) || budget <= 0) return "";

    const monthStart = monthStartInTaipei();
    const { data: txns } = await db()
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
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
