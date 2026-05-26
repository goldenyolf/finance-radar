import { NextResponse, type NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
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

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelAccessToken) {
    console.error("[cron] LINE_CHANNEL_ACCESS_TOKEN 未設定，無法推播");
    return NextResponse.json({
      ok: false,
      reason: "missing LINE_CHANNEL_ACCESS_TOKEN",
    });
  }

  // service client 繞過 RLS，跨使用者掃所有訂閱
  const supabase = createServiceClient();

  // 撈所有訂閱 + 帳戶 + 所有 profile bindings；profiles 是 user_id → line_user_id 的對應
  const [subsRes, accountsRes, profilesRes] = await Promise.all([
    supabase.from("subscriptions").select("*"),
    supabase.from("accounts").select("id, name"),
    supabase.from("profiles").select("user_id, line_user_id"),
  ]);

  if (subsRes.error) {
    console.error("[cron] subscriptions fetch failed:", subsRes.error);
    return NextResponse.json(
      { error: subsRes.error.message },
      { status: 500 }
    );
  }

  const subs = (subsRes.data ?? []) as Array<
    SubscriptionRow & { user_id: string }
  >;
  const accountsData = (accountsRes.data ?? []) as Array<{
    id: string;
    name: string;
  }>;
  const profiles = (profilesRes.data ?? []) as Array<{
    user_id: string;
    line_user_id: string | null;
  }>;
  const profileByUser = new Map(profiles.map((p) => [p.user_id, p.line_user_id]));

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
  let skipped = 0;
  for (const sub of due) {
    // 找這筆訂閱的擁有者綁了哪個 LINE user — 沒綁的就跳過 push
    const lineUserId = profileByUser.get(sub.user_id);
    if (!lineUserId) {
      skipped++;
      console.warn(
        `[cron] subscription ${sub.id} (user ${sub.user_id}) 沒綁 LINE，跳過推播`
      );
      // 仍然要 advance，否則下次 cron 又會卡在這筆
      const nextDate = advanceBillingDate(
        sub.next_billing_date,
        sub.billing_cycle
      );
      await supabase
        .from("subscriptions")
        .update({ next_billing_date: nextDate })
        .eq("id", sub.id);
      continue;
    }

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
    skipped,
  });
}
