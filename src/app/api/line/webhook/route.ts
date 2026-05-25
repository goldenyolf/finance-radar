import { NextResponse, type NextRequest } from "next/server";
import {
  validateSignature,
  messagingApi,
  type webhook,
} from "@line/bot-sdk";

import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const DEFAULT_USER_ID = "user-001";
const PERSONAL_ACCOUNT_ID = "acc-001";       // 中信（百五個人）
const SHARED_ACCOUNT_ID = "acc-taishin";     // 台新共同戶
const SHARED_KEYWORDS = ["共同", "家庭"];

type ParsedEntry = {
  amount: number;
  title: string;
  accountId: string;
  accountLabel: string;
};

function parseExpenseMessage(text: string): ParsedEntry | null {
  let working = text.trim();
  if (!working) return null;

  let accountId = PERSONAL_ACCOUNT_ID;
  let accountLabel = "中信";

  for (const kw of SHARED_KEYWORDS) {
    if (working.startsWith(kw)) {
      working = working.slice(kw.length).trim();
      accountId = SHARED_ACCOUNT_ID;
      accountLabel = "台新共同";
      break;
    }
  }

  const amountMatch = working.match(/\d+(?:\.\d+)?/);
  if (!amountMatch) return null;

  const amount = Number(amountMatch[0]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const title = (
    working.slice(0, amountMatch.index ?? 0) +
    working.slice((amountMatch.index ?? 0) + amountMatch[0].length)
  )
    .replace(/\s+/g, " ")
    .trim();

  if (!title) return null;

  return { amount, title, accountId, accountLabel };
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

  try {
    const { error } = await supabase.from("transactions").insert({
      user_id: DEFAULT_USER_ID,
      account_id: parsed.accountId,
      description: parsed.title,
      amount: parsed.amount,
      type: "expense",
      category: "non_essential",
      status: "completed",
      date: todayInTaipei(),
    });

    if (error) {
      console.error("[LINE webhook] Supabase insert error:", error);
      await replyText(client, replyToken, "❌ 記帳失敗，請稍後再試或檢查系統日誌。");
      return;
    }

    await replyText(
      client,
      replyToken,
      `✅ 已記帳：${parsed.title} $${parsed.amount}（${parsed.accountLabel}）`
    );
  } catch (err) {
    console.error("[LINE webhook] Unexpected error:", err);
    await replyText(client, replyToken, "❌ 記帳失敗，請稍後再試或檢查系統日誌。");
  }
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
