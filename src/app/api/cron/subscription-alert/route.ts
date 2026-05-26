import { NextResponse, type NextRequest } from "next/server";

import { supabase } from "@/lib/supabase";
import { getAccountLabel } from "@/lib/account-display";
import { formatCurrency } from "@/lib/dashboard";
import { sendLinePushNotification } from "@/lib/line-push";
import {
  advanceBillingDate,
  daysUntilBilling,
  type SubscriptionRow,
} from "@/lib/subscriptions";

// 走 Node runtime — 需要讀 Sensitive env vars (LINE_CHANNEL_ACCESS_TOKEN
// 跟 CRON_SECRET 之類），跟 webhook 同套設定
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALERT_LEAD_DAYS = 3;

/**
 * Vercel Cron Job 觸發點：每日掃一次 subscriptions，對「剛好剩 3 天扣款」的
 * 項目推 LINE 警報，並把 next_billing_date 推進到下一輪。
 *
 * 安全防護：
 *   - 驗 CRON_SECRET（Vercel 自動帶 Authorization: Bearer <secret> header）
 *   - 沒設 secret 一律拒絕，避免 endpoint 被陌生人觸發狂發 push
 *   - LINE_USER_ID / ACCESS_TOKEN 沒設則 log + return（不會推但也不會崩）
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron] CRON_SECRET 未設定，拒絕執行");
    return NextResponse.json(
      { error: "Server misconfigured: CRON_SECRET" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lineUserId = process.env.LINE_USER_ID;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!lineUserId || !channelAccessToken) {
    console.error(
      "[cron] LINE_USER_ID 或 LINE_CHANNEL_ACCESS_TOKEN 未設定，無法推播"
    );
    return NextResponse.json({
      ok: false,
      reason: "missing LINE_USER_ID or LINE_CHANNEL_ACCESS_TOKEN",
    });
  }

  // 撈所有訂閱 + 對應帳戶（給 push message 顯示帳戶名用）
  const [subsRes, accountsRes] = await Promise.all([
    supabase.from("subscriptions").select("*"),
    supabase.from("accounts").select("id, name"),
  ]);

  if (subsRes.error) {
    console.error("[cron] subscriptions fetch failed:", subsRes.error);
    return NextResponse.json(
      { error: subsRes.error.message },
      { status: 500 }
    );
  }

  const subs = (subsRes.data ?? []) as SubscriptionRow[];
  const accountsData = (accountsRes.data ?? []) as Array<{
    id: string;
    name: string;
  }>;

  const now = new Date();
  const due = subs.filter(
    (s) => daysUntilBilling(s.next_billing_date, now) === ALERT_LEAD_DAYS
  );

  if (due.length === 0) {
    return NextResponse.json({ ok: true, checked: subs.length, pushed: 0 });
  }

  // 逐筆推 LINE 警報 + 把 next_billing_date 往後推一輪
  let pushed = 0;
  let advanced = 0;
  for (const sub of due) {
    const accName = getAccountLabel(
      sub.account_id,
      accountsData.find((a) => a.id === sub.account_id)?.name
    );
    const amount = formatCurrency(Number(sub.amount));
    const cycleLabel = sub.billing_cycle === "yearly" ? "每年" : "每月";

    const message =
      `💡 訂閱續扣提醒\n\n` +
      `項目：${sub.name}（${cycleLabel}）\n` +
      `扣款日：${sub.next_billing_date}（剩 ${ALERT_LEAD_DAYS} 天）\n` +
      `金額：${amount}\n` +
      `帳戶：${accName}\n\n` +
      `若已無使用需求，請及時取消訂閱，防範財務漏洞。`;

    const ok = await sendLinePushNotification({
      userId: lineUserId,
      text: message,
      channelAccessToken,
    });
    if (ok) pushed++;

    // 推完就把 next_billing_date 推進一輪，避免下次 cron 重複推
    const nextDate = advanceBillingDate(
      sub.next_billing_date,
      sub.billing_cycle
    );
    const { error: updateErr } = await supabase
      .from("subscriptions")
      .update({ next_billing_date: nextDate })
      .eq("id", sub.id);
    if (!updateErr) advanced++;
    else
      console.error(
        `[cron] failed to advance subscription ${sub.id}:`,
        updateErr
      );
  }

  return NextResponse.json({
    ok: true,
    checked: subs.length,
    matched: due.length,
    pushed,
    advanced,
  });
}
