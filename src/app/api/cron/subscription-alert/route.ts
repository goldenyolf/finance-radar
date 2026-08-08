import { NextResponse, type NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { getAccountLabel } from "@/lib/account-display";
import { formatCurrency } from "@/lib/dashboard";
import { sendLinePushNotification } from "@/lib/line-push";
import {
  catchUpBillingDate,
  daysUntilBilling,
  type SubscriptionRow,
} from "@/lib/subscriptions";

// 走 Node runtime — 需要讀 Sensitive env vars (LINE_CHANNEL_ACCESS_TOKEN
// 跟 CRON_SECRET 之類），跟 webhook 同套設定
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALERT_LEAD_DAYS = 3;

/**
 * Vercel Cron Job 觸發點：每日掃一次 subscriptions，對「剩 <= 3 天扣款」的
 * 項目推一次 LINE 警報；扣款日過了才把 next_billing_date 推進到下一輪。
 *
 * 兩件事刻意拆開（per 0033，修正舊版兩個 bug）：
 *
 *   1) 提醒窗用 `0 <= days <= 3` 而非舊版的 `days === 3`。
 *      嚴格等號代表 cron 只要有一天沒跑到（部署中 / function 失敗 / 排程
 *      飄移），該筆訂閱從此再也不會等於 3，日期永遠不推進、之後每天都不
 *      命中 —— 靜默死亡。改成區間後，晚一兩天跑照樣補得到。
 *
 *   2) 推進 next_billing_date 的條件是「扣款日已過」(days < 0)，不是
 *      「剩 3 天」。舊版提前 3 天就把日期跳到下個月，導致 LINE 說「剩 3
 *      天扣款」但網頁的 SubscriptionAlertWidget（<= 7 天才顯示）看不到這
 *      筆，兩邊講的話對不上。而且 cron 停擺多輪時走 catchUpBillingDate
 *      一次補到現在，不會只推一輪永遠追不上。
 *
 * 去重：last_alerted_billing_date 記「這個扣款日推過了」。放寬成區間後，
 * 沒有去重會連推 4 天；用 billing date 當 key 保證一輪剛好一次。
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

  let matched = 0;
  let pushed = 0;
  let advanced = 0;
  let skipped = 0;

  for (const sub of subs) {
    const days = daysUntilBilling(sub.next_billing_date, now);
    if (Number.isNaN(days)) {
      console.warn(
        `[cron] subscription ${sub.id} next_billing_date 無法解析：${sub.next_billing_date}`
      );
      continue;
    }

    // ── (1) 扣款日已過 → 補跑到今天或未來，這輪不推播 ──
    //    catchUpBillingDate 會連推多輪，cron 停擺一整個月也追得回來。
    if (days < 0) {
      const nextDate = catchUpBillingDate(
        sub.next_billing_date,
        sub.billing_cycle,
        now
      );
      if (nextDate !== sub.next_billing_date) {
        // 多租戶雙保險：service client 繞過 RLS，顯式帶 user_id
        const { error: advErr } = await supabase
          .from("subscriptions")
          .update({ next_billing_date: nextDate })
          .eq("id", sub.id)
          .eq("user_id", sub.user_id);
        if (advErr) {
          console.error(
            `[cron] failed to advance subscription ${sub.id}:`,
            advErr
          );
        } else {
          advanced++;
        }
      }
      continue;
    }

    // ── (2) 還沒進提醒窗 → 什麼都不做 ──
    if (days > ALERT_LEAD_DAYS) continue;
    matched++;

    // ── (3) 這個扣款日已經推過 → 靜默 skip（放寬成區間後的去重關鍵）──
    if (sub.last_alerted_billing_date === sub.next_billing_date) continue;

    // ── (4) 沒綁 LINE → 推不了。刻意不寫去重標記：日後綁了 LINE 且還在
    //        窗內就補得到，而扣款日一過 (1) 會照常推進，不會卡住。
    const lineUserId = profileByUser.get(sub.user_id);
    if (!lineUserId) {
      skipped++;
      console.warn(
        `[cron] subscription ${sub.id} (user ${sub.user_id}) 沒綁 LINE，跳過推播`
      );
      continue;
    }

    const accName = getAccountLabel(
      sub.account_id,
      accountsData.find((a) => a.id === sub.account_id)?.name
    );
    const amount = formatCurrency(Number(sub.amount));
    const cycleLabel = sub.billing_cycle === "yearly" ? "每年" : "每月";
    const dayLabel = days === 0 ? "今天扣款" : `剩 ${days} 天`;

    const message =
      `💡 訂閱續扣提醒\n\n` +
      `項目：${sub.name}（${cycleLabel}）\n` +
      `扣款日：${sub.next_billing_date}（${dayLabel}）\n` +
      `金額：${amount}\n` +
      `帳戶：${accName}\n\n` +
      `若已無使用需求，請及時取消訂閱，防範財務漏洞。`;

    const ok = await sendLinePushNotification({
      userId: lineUserId,
      text: message,
      channelAccessToken,
    });
    if (!ok) {
      // 推播失敗不寫去重標記 → 明天 cron 會重試（只要還在窗內）。
      console.error(`[cron] LINE push failed for subscription ${sub.id}`);
      continue;
    }
    pushed++;

    // 推成功才落去重標記，避免「推失敗卻被當成推過」而永久消音
    const { error: markErr } = await supabase
      .from("subscriptions")
      .update({ last_alerted_billing_date: sub.next_billing_date })
      .eq("id", sub.id)
      .eq("user_id", sub.user_id);
    if (markErr) {
      console.error(
        `[cron] failed to mark subscription ${sub.id} as alerted:`,
        markErr
      );
    }
  }

  return NextResponse.json({
    ok: true,
    checked: subs.length,
    matched,
    pushed,
    advanced,
    skipped,
  });
}
