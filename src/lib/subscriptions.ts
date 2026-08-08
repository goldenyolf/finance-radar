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
  /**
   * per 0033 — 「已針對這個 next_billing_date 推播過續扣提醒」的去重標記。
   * null / 不等於 next_billing_date = 這一輪還沒推過。只有 cron 會讀寫，
   * UI 端不需要（select("*") 會帶回來，故宣告成 optional 避免 caller 被迫填）。
   */
  last_alerted_billing_date?: string | null;
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

/**
 * 反覆 advanceBillingDate 直到扣款日回到「今天或未來」，回傳補跑後的日期。
 *
 * 為什麼需要補跑：cron 可能連續多天沒跑到（專案暫停、function 持續失敗、
 * 排程被關掉）。舊版一次只推一輪，一旦落後超過一個週期就永遠追不上，
 * 訂閱的 next_billing_date 會卡在過去日期爛掉。
 *
 * 已經是今天或未來 → 原值回傳（no-op，呼叫端可用 `!==` 判斷要不要寫 DB）。
 *
 * maxSteps 是 runaway 保險：monthly 訂閱 600 步 = 50 年，正常資料絕不會
 * 撞到；真的撞到代表日期資料壞掉（例如 1900 年），這時停下來回傳當前值
 * 比無限迴圈卡死 cron 好。
 */
export function catchUpBillingDate(
  current: string,
  cycle: BillingCycle,
  now: Date = new Date(),
  maxSteps = 600
): string {
  let date = current;
  for (let i = 0; i < maxSteps; i++) {
    const days = daysUntilBilling(date, now);
    if (Number.isNaN(days) || days >= 0) return date;
    const next = advanceBillingDate(date, cycle);
    // advanceBillingDate 遇到爛日期會原值回傳 → 沒有前進就跳出，避免死迴圈
    if (next === date) return date;
    date = next;
  }
  return date;
}
