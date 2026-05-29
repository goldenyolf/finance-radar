import { NextResponse, type NextRequest } from "next/server";
import {
  validateSignature,
  messagingApi,
  type webhook,
} from "@line/bot-sdk";

import { createServiceClient } from "@/lib/supabase/service";
import {
  buildCategoryLookup,
  classifyByCategoryKeywords,
  type CategoryLookup,
  type CategoryRow,
} from "@/lib/categories";
import { formatCurrency } from "@/lib/dashboard";
import {
  classifyByKeyword,
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/expense-categories";
import {
  parseLineMessageWithLlm,
  type LineAccountContext,
} from "@/lib/line-llm-parse";
import { downloadLineMedia } from "@/lib/line-media";
import { classifyByLlm } from "@/lib/llm-classify";
import { extractInvoiceItems, type InvoiceItem } from "@/lib/openai-vision";
import { transcribeAudio } from "@/lib/openai-whisper";

export const runtime = "nodejs";

// Lazy service client — 不在 module load 期間建（否則 build 階段 collect
// page data 會因為沒 SUPABASE_SERVICE_ROLE_KEY 而崩）。同一 worker 內建一
// 次後續重用，無 session 狀態跨 request 安全。
let _supabase: ReturnType<typeof createServiceClient> | null = null;
function db() {
  if (!_supabase) _supabase = createServiceClient();
  return _supabase;
}

/**
 * 純解析結果：amount + title。帳戶歸屬由 resolveTargetAccount 走 fallback
 * chain 決定，這裡不再像舊版那樣硬塞 PERSONAL/SHARED 寫死的 account id。
 */
type ParsedEntry = {
  amount: number;
  title: string;
};

/* ─────────────── Income vs Expense intent detection ─────────────── */

/**
 * 從訊息語意判斷這筆是「收入」還是「支出」。
 *
 * 策略：關鍵字優先（fast + deterministic + 零成本），LLM 是 overkill 因為這些
 * 詞彙在中文記帳場景非常 unambiguous：「領到 3000」「補助 5000」「薪水 50k」
 * 一律是錢進來；不命中 → expense（保留原本 default 行為）。
 *
 * 例：
 *   "領到補助 3000"  → income
 *   "薪水 50000"     → income
 *   "花了 300"       → expense (default)
 *   "午餐 120"       → expense
 */
const INCOME_KEYWORDS = [
  // 動詞 — 主動拿到
  "領到", "領了", "收到", "收了", "拿到", "拿了", "得到",
  "入帳", "存入", "進帳", "匯入",
  // 名詞 — 錢的來源
  "薪水", "薪資", "工資", "年終", "獎金", "紅包",
  "補助", "補貼", "津貼", "退稅", "退款",
  "利息", "股息", "配息", "回饋",
];

function detectTransactionType(text: string): "income" | "expense" {
  for (const kw of INCOME_KEYWORDS) {
    if (text.includes(kw)) return "income";
  }
  return "expense";
}

/**
 * Regex fallback parser — 只抽 {amount, title}。
 * 帳戶歸屬交給 resolveTargetAccount 走 fallback chain（語意切分難用 regex
 * 處理穩定，硬塞共同/個人寫死帳戶在多租戶下是 bug 不是 feature）。
 *
 * 只在 LLM 不可用 / timeout / JSON 解析失敗時走這條路。
 */
function parseExpenseMessage(text: string): ParsedEntry | null {
  const working = text.trim();
  if (!working) return null;

  const amountResult = extractAmount(working);
  if (!amountResult) return null;

  const title = working
    .replace(amountResult.matchText, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return null;

  return { amount: amountResult.amount, title };
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

/**
 * service client 沒 RLS context — 必須顯式 .eq("user_id", ...)。
 * 撈失敗回空陣列；下游所有 classifier / label resolver 看到 [] 都會 fallback
 * 到靜態 7 大類 + EXPENSE_CATEGORY_LABEL，整條 pipeline 不會崩。
 */
async function loadUserCategories(userId: string): Promise<CategoryRow[]> {
  const { data, error } = await db()
    .from("categories")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    console.error("[LINE webhook] categories fetch failed:", error);
    return [];
  }
  return (data ?? []) as CategoryRow[];
}

/**
 * 撈 user 的所有帳戶（多租戶必經之路）。按 created_at asc 排序，讓 fallback
 * chain 最末段「first account」行為穩定可預期。撈失敗回空陣列。
 */
async function loadUserAccounts(userId: string): Promise<LineAccountContext[]> {
  const { data, error } = await db()
    .from("accounts")
    .select("id, name, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[LINE webhook] accounts fetch failed:", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }));
}

/**
 * Fallback chain — 把 LLM 抽到的 override + category 投射到實際 account_id。
 * 純 in-memory（profileDefault 由 caller 一次撈起來傳入），避免每筆訊息打 DB。
 *
 *   (A) override：LLM 已 fuzzy match 完
 *   (B) category.default_account_id：分類層偏好（如「水電」永遠走台新）
 *   (C) profile.default_account_id：帳號層主要帳戶 singleton
 *   (D) accounts 最早一筆：保底（避免 new user 還沒設 default 時崩潰）
 */
function resolveTargetAccount(args: {
  overrideAccountId: string | null;
  category: ExpenseCategory | null;
  accounts: LineAccountContext[];
  profileDefaultAccountId: string | null;
  categoryLookup: CategoryLookup;
}): { id: string; label: string } | null {
  const {
    overrideAccountId,
    category,
    accounts,
    profileDefaultAccountId,
    categoryLookup,
  } = args;
  const findAcc = (id: string | null | undefined) =>
    id ? accounts.find((a) => a.id === id) : undefined;

  const override = findAcc(overrideAccountId);
  if (override) return { id: override.id, label: override.name };

  if (category) {
    const cat = categoryLookup.byCode.get(category);
    const hit = findAcc(cat?.default_account_id);
    if (hit) return { id: hit.id, label: hit.name };
  }

  const profileHit = findAcc(profileDefaultAccountId);
  if (profileHit) return { id: profileHit.id, label: profileHit.name };

  if (accounts.length > 0) {
    return { id: accounts[0].id, label: accounts[0].name };
  }
  return null;
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
      .select("user_id, default_account_id")
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
    const profileDefaultAccountId =
      (profile.default_account_id as string | null | undefined) ?? null;

    // 撈一次 categories + accounts — text / audio / image 三條 pipeline 共用，
    // 避免每條都自己撈。accounts 還會被 buildLineParsePrompt 注入 LLM。
    const [userCategories, userAccounts] = await Promise.all([
      loadUserCategories(userId),
      loadUserAccounts(userId),
    ]);

    const ctx: HandlerContext = {
      userId,
      userCategories,
      userAccounts,
      profileDefaultAccountId,
    };

    switch (messageEvent.message.type) {
      case "text": {
        const text = (messageEvent.message as webhook.TextMessageContent).text;
        await handleTextMessage(text, ctx, client, replyToken);
        return;
      }
      case "audio": {
        const messageId = messageEvent.message.id;
        await handleAudioMessage(
          messageId,
          ctx,
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
          ctx,
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

/* ─────────────────────────── Handler context ─────────────────────────── */

/**
 * dispatcher 預先撈好的「per-request 不變資料」打包，避免 text/audio/image
 * 三條 pipeline 各自重複撈 DB。
 */
interface HandlerContext {
  userId: string;
  userCategories: CategoryRow[];
  userAccounts: LineAccountContext[];
  profileDefaultAccountId: string | null;
}

/* ─────────────────────────── Text ─────────────────────────── */

/**
 * 文字訊息核心邏輯。也被 audio handler 在 Whisper 轉錄後重用 — 因此抽成
 * 獨立函式，加 prefix 參數讓 audio 能在回覆前加「🎙️ 語音辨識成功」。
 *
 * 流程：
 *   1) goal deposit（夢想基金提撥）優先 — 命中直接 return
 *   2) income vs expense 偵測（純關鍵字、零成本）
 *   3) LLM 主路徑：parseLineMessageWithLlm 一次抽 {item, amount, account_override, category}
 *   4) Fallback：LLM 不可用 → regex 抽 {amount, title}（不抽帳戶）
 *   5) Fallback chain 決定 account_id：override → category default → profile default → first
 */
async function handleTextMessage(
  text: string,
  ctx: HandlerContext,
  client: messagingApi.MessagingApiClient,
  replyToken: string,
  replyPrefix: string = ""
): Promise<void> {
  const { userId, userCategories, userAccounts, profileDefaultAccountId } = ctx;

  // 1. 先試夢想基金提撥
  const goalHandled = await tryGoalDeposit(text, userId, client, replyToken, replyPrefix);
  if (goalHandled) return;

  // 2. income vs expense
  const txType = detectTransactionType(text);
  const lookup = buildCategoryLookup(userCategories);

  // 3. LLM 主路徑（注入 accounts + categories 上下文）
  const llmResult = await parseLineMessageWithLlm({
    text,
    accounts: userAccounts,
    categories: userCategories,
  });

  let item: string;
  let amount: number;
  let overrideAccountId: string | null;
  let llmCategory: ExpenseCategory | null;

  if (llmResult) {
    item = llmResult.item;
    amount = llmResult.amount;
    overrideAccountId = llmResult.accountId;
    llmCategory = llmResult.category;
  } else {
    // 4. Fallback：regex 純抽 amount+title
    const regex = parseExpenseMessage(text);
    if (!regex) {
      await replyText(
        client,
        replyToken,
        `${replyPrefix}💡 記帳格式錯誤囉！\n• 支出：午餐 120 / 台新 晚餐 500\n• 收入：薪水 50000 / 領到補助 3000`
      );
      return;
    }
    item = regex.title;
    amount = regex.amount;
    overrideAccountId = null;
    llmCategory = null;
  }

  // expense 才需要 category；income 直接 null
  const category: ExpenseCategory | null =
    txType === "expense"
      ? (llmCategory ?? (await classifyExpense(item, userCategories)))
      : null;

  // 5. Fallback chain → 真正的 account_id
  const target = resolveTargetAccount({
    overrideAccountId,
    category,
    accounts: userAccounts,
    profileDefaultAccountId,
    categoryLookup: lookup,
  });
  if (!target) {
    await replyText(
      client,
      replyToken,
      `${replyPrefix}❌ 找不到可用帳戶，請先到網頁端建立一個帳戶再開始記帳。`
    );
    return;
  }

  if (txType === "income") {
    try {
      const { error } = await db().from("transactions").insert({
        user_id: userId,
        account_id: target.id,
        description: item,
        amount,
        type: "income",
        priority: "non_essential", // income 此欄無意義，給預設值避免 NOT NULL
        category: null,
        status: "completed",
        date: todayInTaipei(),
      });
      if (error) {
        console.error("[LINE webhook] income insert error:", error);
        await replyText(
          client,
          replyToken,
          `${replyPrefix}❌ 記錄收入失敗，請稍後再試。`
        );
        return;
      }
      await replyText(
        client,
        replyToken,
        `${replyPrefix}💰 已記錄收入：${item} +$${amount}（${target.label}）`
      );
    } catch (err) {
      console.error("[LINE webhook] income unexpected error:", err);
      await replyText(
        client,
        replyToken,
        `${replyPrefix}❌ 記錄收入失敗，請稍後再試。`
      );
    }
    return;
  }

  // ── Expense flow ──
  const safeCategory = category ?? "other";
  const categoryLabel = resolveCategoryLabel(safeCategory, lookup);

  try {
    const { error } = await db().from("transactions").insert({
      user_id: userId,
      account_id: target.id,
      description: item,
      amount,
      type: "expense",
      priority: "non_essential",
      category: safeCategory,
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

    const warning = await buildBudgetWarning(userId, safeCategory, lookup);
    await replyText(
      client,
      replyToken,
      `${replyPrefix}✅ 已成功記帳：[${categoryLabel}] ${item} $${amount}（${target.label}）${warning}`
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

/**
 * 取得 category 在 LINE 回覆中顯示用的中文名稱。
 * 優先使用者自訂的 categories.name，沒有再 fallback 到靜態 7 大類 label。
 */
function resolveCategoryLabel(
  category: ExpenseCategory,
  lookup: CategoryLookup
): string {
  return (
    lookup.byCode.get(category)?.name ??
    EXPENSE_CATEGORY_LABEL[category] ??
    "其他"
  );
}

/* ─────────────────────────── Audio (Whisper STT) ─────────────────────────── */

/**
 * Audio → Whisper STT → 餵給文字解析鏈，用 replyPrefix 加上「🎙️ 語音辨識成功：原話」。
 * 任何一步失敗都回友善訊息，不讓 webhook 整個崩潰。
 */
async function handleAudioMessage(
  messageId: string,
  ctx: HandlerContext,
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
  await handleTextMessage(transcript, ctx, client, replyToken, prefix);
}

/* ─────────────────────────── Image (Vision LLM) ─────────────────────────── */

/**
 * Image → Vision LLM → 多筆 InvoiceItem → 批次寫入 supabase → 多行條列式回覆。
 *
 * 帳戶歸屬：圖片本身沒有「override」上下文（LINE image 不能附 caption），
 * 但每筆 item 仍可走 fallback chain：category.default_account_id →
 * profile.default_account_id → 最早帳戶。這讓不同分類能各自落到正確帳戶
 * （例：水電發票走台新、加油走中信），不再像舊版那樣全部塞 acc-001。
 */
async function handleImageMessage(
  messageId: string,
  ctx: HandlerContext,
  channelAccessToken: string,
  client: messagingApi.MessagingApiClient,
  replyToken: string
): Promise<void> {
  const { userId, userCategories, userAccounts, profileDefaultAccountId } = ctx;
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
      categories: userCategories,
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

  const lookup = buildCategoryLookup(userCategories);

  // 每筆 item 走一次 in-memory fallback chain（沒 override，純走 category→profile→first）
  const resolved = items.map((item) => ({
    item,
    target: resolveTargetAccount({
      overrideAccountId: null,
      category: item.category,
      accounts: userAccounts,
      profileDefaultAccountId,
      categoryLookup: lookup,
    }),
  }));

  // 如果連保底帳戶都沒（user 完全沒建帳戶）→ 整批拒絕
  if (resolved.some((r) => r.target === null)) {
    await replyText(
      client,
      replyToken,
      "❌ 找不到可用帳戶，請先到網頁端建立一個帳戶再開始記帳。"
    );
    return;
  }

  const today = todayInTaipei();
  const rows = resolved.map(({ item, target }) => ({
    user_id: userId,
    // resolved 內保證 target !== null（上方檢查過）；用 ! 收斂 TS narrowing。
    account_id: target!.id,
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

  const warnings = await collectBudgetWarnings(userId, items, lookup);

  const total = items.reduce((sum, i) => sum + i.amount, 0);
  // 同帳戶連續多筆會視覺重複；只在「跟前一筆不同」時附帳戶後綴，UX 較乾淨。
  const lines = resolved.map(({ item, target }, idx) => {
    const prev = idx > 0 ? resolved[idx - 1].target?.id : null;
    const suffix = target!.id !== prev ? `（${target!.label}）` : "";
    return `${idx + 1}. [${resolveCategoryLabel(item.category, lookup)}] ${item.name} $${item.amount}${suffix}`;
  });

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
  items: InvoiceItem[],
  lookup: CategoryLookup
): Promise<string[]> {
  const byCategory = new Map<ExpenseCategory, number>();
  for (const it of items) {
    byCategory.set(it.category, (byCategory.get(it.category) ?? 0) + it.amount);
  }
  const warnings: string[] = [];
  for (const cat of byCategory.keys()) {
    const w = await buildBudgetWarning(userId, cat, lookup);
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
  category: ExpenseCategory,
  lookup: CategoryLookup
): Promise<string> {
  if (category === "other") return "";

  try {
    // 預算從 categories.budget_monthly 拿（Phase 5 之後不再走 system_settings）
    const row = lookup.byCode.get(category);
    const budget = row?.budget_monthly ?? 0;
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
    const label = resolveCategoryLabel(category, lookup);

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
 * 三段式分類，優先用使用者自訂的關鍵字 / LLM prompt，缺資料時 fallback：
 *   1. 使用者 categories.keywords 比對（最長關鍵字優先）—— 命中且是內建 code 直接用
 *   2. 沒命中時打 LLM（Gemini），prompt 用使用者的 name + keywords 客製
 *   3. 仍無 → 退到舊的靜態關鍵字 classifier，最後 fallback 'other'
 *
 * 為什麼第一段命中還要檢查 row.code != null：transactions.category 還是
 * snake_case enum 欄位，自訂分類（code=null）目前無法落到該欄；Phase 5
 * 切換到 category_id UUID 之後就可以放開這個限制。
 */
async function classifyExpense(
  title: string,
  categories: CategoryRow[]
): Promise<ExpenseCategory> {
  // (1) 使用者自訂關鍵字
  if (categories.length > 0) {
    const matched = classifyByCategoryKeywords(title, categories);
    if (matched?.code) return matched.code as ExpenseCategory;
  }

  // (2) LLM with dynamic prompt
  const llm = await classifyByLlm(
    title,
    categories.length > 0 ? categories : undefined
  );
  if (llm) return llm;

  // (3) 退路：靜態關鍵字（fork 友善 — 沒設 categories 也能用）
  const fallback = classifyByKeyword(title);
  return fallback;
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
