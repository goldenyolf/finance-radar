/**
 * LINE Push Message — 不需要 replyToken，主動推訊息給特定 userId。
 *
 * 跟 webhook 的 replyMessage 差別：
 *   - replyMessage 用一次性 replyToken（從 webhook event 拿）、1 分鐘內失效
 *   - pushMessage 走 userId（target 的 LINE ID）、任何時候都可發、有月度配額
 *
 * 配額（截至 2026）：免費方案約 200 push/月，這個 app 用量極低（訂閱項目
 * 通常 < 30 筆/月，每筆 3 天預警 = ~30 push/月）遠在配額內。
 *
 * 設計：失敗 log + return false，**不拋 exception**，避免 cron 整批中斷
 * 因為其中一筆推失敗。
 */

const PUSH_URL = "https://api.line.me/v2/bot/message/push";

export interface SendPushOptions {
  /** LINE User ID（U 開頭的字串） */
  userId: string;
  /** 訊息內容；最長 5000 字 */
  text: string;
  /** LINE Channel Access Token，從 process.env 讀 */
  channelAccessToken: string;
}

export async function sendLinePushNotification({
  userId,
  text,
  channelAccessToken,
}: SendPushOptions): Promise<boolean> {
  if (!userId || !channelAccessToken) {
    console.error(
      "[line-push] 缺少 userId 或 channelAccessToken，跳過此筆推播"
    );
    return false;
  }

  try {
    const res = await fetch(PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      console.error(
        `[line-push] LINE Push API ${res.status}: ${body.slice(0, 200)}`
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error("[line-push] fetch failed:", err);
    return false;
  }
}
