/**
 * PIN 鎖的 HMAC-SHA256 cookie 簽章 helper。
 *
 * 走 Web Crypto (`globalThis.crypto.subtle`) 而不是 `node:crypto`，
 * 因為 proxy.ts 在 Vercel Edge runtime 執行，不能用 Node module。
 * Web Crypto API 在 Node 18+ 跟 Edge 都可用，所以 login server action
 * (Node) 跟 proxy (Edge) 共用同一份 helper 不會有相容性問題。
 *
 * Token 格式：v1.<issuedAtMs>.<hexSig>
 *   - v1：版本號，未來改演算法或 payload 時遞增就好，舊 token 自動失效
 *   - issuedAtMs：簽發時的 epoch ms，用來判過期（30 天）
 *   - hexSig：HMAC-SHA256("v1.<issuedAtMs>", SITE_AUTH_SECRET) 的 hex
 *
 * 為什麼帶 issuedAt：純 HMAC 是 deterministic 的 — 同樣的 payload + secret
 * 簽出來永遠一樣，等於 cookie 值是固定字串，依然可重放。加 issuedAt 後
 * 每次登入產生不同 token，且 proxy 可以拒絕過期的 token。
 */

const TOKEN_VERSION = "v1";
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

/** 用 secret 簽出一個新的 auth token，等同「發給瀏覽器的 cookie 值」。 */
export async function signAuthToken(secret: string): Promise<string> {
  const issuedAt = Date.now();
  const payload = `${TOKEN_VERSION}.${issuedAt}`;
  const sig = await hmacHex(payload, secret);
  return `${payload}.${sig}`;
}

/**
 * 驗證 cookie 帶上來的 token 是否：
 *   (a) 格式正確且版本相符
 *   (b) HMAC 簽章用同一 secret 重新算結果相同
 *   (c) 未過期（distance(now, issuedAt) <= 30 days）
 * 任何一條不過直接 false（不洩漏失敗原因，避免 timing oracle）。
 */
export async function verifyAuthToken(
  token: string | undefined | null,
  secret: string
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [version, issuedAtStr, providedSig] = parts;
  if (version !== TOKEN_VERSION) return false;

  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false;

  // 過期檢查 — 必須在 30 天內
  const age = Date.now() - issuedAt;
  if (age < 0 || age > TOKEN_MAX_AGE_MS) return false;

  // 重算 HMAC 比對；constant-time 避免 timing attack 偷簽章 byte
  const expected = await hmacHex(`${version}.${issuedAtStr}`, secret);
  return timingSafeEqual(providedSig, expected);
}

/* ─────────────────────────── internals ─────────────────────────── */

async function hmacHex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 用 XOR 累加比對兩個等長字串。比 a === b 安全，因為後者一旦發現第一個
 * 不一樣的 byte 就 early return，攻擊者可以靠 response time 推斷 prefix。
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
