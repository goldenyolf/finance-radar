/**
 * LINE Data API 媒體下載 — 拿 messageId 換 audio / image 的 binary。
 *
 * 跟 messaging API 不同 endpoint：
 *   - api.line.me      → 文字訊息收發、reply token 等
 *   - api-data.line.me → 媒體內容下載
 *
 * Webhook 收到 message event 時，event.message 只帶 id + type，實際內容
 * （音檔 byte / 圖片 byte）要拿 id 來這支 endpoint 換。
 */

export interface DownloadedMedia {
  buffer: Buffer;
  /** LINE 回傳的 Content-Type header，例如 "audio/m4a" 或 "image/jpeg" */
  contentType: string;
}

export async function downloadLineMedia(
  messageId: string,
  channelAccessToken: string
): Promise<DownloadedMedia> {
  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(
      `LINE content fetch failed: ${res.status} ${res.statusText}`
    );
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), contentType };
}
