/**
 * OpenAI Whisper STT — LINE audio buffer 轉中文逐字稿。
 *
 * 走 fetch + FormData 直接打 REST endpoint，不裝 openai SDK，
 * 跟現有 llm-classify.ts 走相同的「無 SDK」風格，避免 bundle 變胖。
 *
 * Node 18+ 內建 FormData 跟 Blob，所以這支只能在 webhook（Node runtime）
 * 用，不能搬到 Edge proxy。
 */

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export interface TranscribeOptions {
  /** OpenAI API key。從呼叫端讀 process.env，集中錯誤訊息。 */
  apiKey: string;
  /** 音訊 binary（從 LINE Data API 下載來的 Buffer） */
  audio: Buffer;
  /** Buffer 的 MIME，從 LINE Content-Type 帶過來；LINE audio 通常 "audio/m4a" */
  contentType?: string;
  /** 提示 Whisper 主要語言，提高短句辨識率。預設 "zh"。 */
  language?: string;
}

/**
 * 失敗一律 throw — 呼叫端用 try/catch 接住，回傳友善 LINE 訊息給使用者。
 * 不靜默 fallback 是刻意：語音記帳失敗使用者必須知道，不能默默吃掉訊息。
 */
export async function transcribeAudio({
  apiKey,
  audio,
  contentType = "audio/m4a",
  language = "zh",
}: TranscribeOptions): Promise<string> {
  // Whisper 接受常見格式 (m4a/mp3/wav/webm 等)。從 MIME 推回檔名副檔名給 FormData。
  const ext = mimeToExt(contentType);
  const filename = `audio.${ext}`;

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(audio)], { type: contentType }),
    filename
  );
  formData.append("model", "whisper-1");
  formData.append("language", language);

  const res = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`Whisper API ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { text?: string };
  const text = json.text?.trim() ?? "";
  if (!text) throw new Error("Whisper returned empty transcript");
  return text;
}

function mimeToExt(mime: string): string {
  if (mime.includes("m4a") || mime.includes("mp4a")) return "m4a";
  if (mime.includes("mp3") || mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  return "m4a"; // LINE 預設
}
