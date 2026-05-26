import { supabase } from "@/lib/supabase";

/**
 * subscriptions 表存「訂閱制扣款」項目，跟既有 recurring_payments 區別：
 *   - recurring_payments：給 forecast 算未來 8 個月用，所有月度金流
 *   - subscriptions       ：給「訂閱漏洞」防禦用，盯著 Netflix/ChatGPT 之類
 *     有意識的訂閱項目，並由 cron job 主動 LINE 推 3 天預警
 *
 * 兩張表概念上可以合併，但分開好處是：subscriptions 加減一筆不影響
 * forecast 曲線，加上獨立的「下次扣款日」欄位語意清楚（recurring 的
 * next_due_date 是 forecast 的起點，不是訂閱續扣日）。
 */

export type BillingCycle = "monthly" | "yearly";

export interface SubscriptionRow {
  id: string;
  name: string;
  amount: number | string;
  billing_cycle: BillingCycle;
  /** ISO date "YYYY-MM-DD" — 下次扣款的當地時區日期 */
  next_billing_date: string;
  account_id: string;
  category: string;
}

/**
 * 失敗時回空陣列。subscriptions 是非關鍵資料，撈不到不該讓首頁整個 500。
 */
export async function loadSubscriptions(): Promise<SubscriptionRow[]> {
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .order("next_billing_date", { ascending: true });
    if (error || !data) return [];
    return data as SubscriptionRow[];
  } catch {
    return [];
  }
}

/**
 * 從 ISO date 字串算「距離今天還有幾天」。負數表示已過期（cron 應該已經推進過）。
 * 用 Taipei 時區基準（轉成當日 00:00 後再 diff）。
 */
export function daysUntilBilling(
  nextBillingDate: string,
  now: Date = new Date()
): number {
  const target = new Date(`${nextBillingDate}T00:00:00+08:00`);
  if (Number.isNaN(target.getTime())) return Number.NaN;

  // 把 now 也轉到 Taipei 當日 00:00，避免 UTC 跨日誤差
  const nowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayTaipei = new Date(`${nowParts}T00:00:00+08:00`);

  const ms = target.getTime() - todayTaipei.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * 把 next_billing_date 依 billing_cycle 往後推一個月或一年。保留 day-of-month。
 * 邊界：1/31 + 1 month 在 JS Date 會 overflow 到 3/3，視為「同 day-of-month
 * 的下個月」這對訂閱續扣的語意是可接受的近似。
 */
export function advanceBillingDate(
  current: string,
  cycle: BillingCycle
): string {
  const d = new Date(`${current}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return current;
  if (cycle === "monthly") {
    d.setMonth(d.getMonth() + 1);
  } else {
    d.setFullYear(d.getFullYear() + 1);
  }
  // 轉回 Taipei 日期字串
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts;
}
