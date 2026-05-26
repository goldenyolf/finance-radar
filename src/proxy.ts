import { NextResponse, type NextRequest } from "next/server";

import { verifyAuthToken } from "@/lib/auth-token";

const COOKIE_NAME = "money_radar_auth";

/**
 * 全域 PIN 鎖：cookie 帶來的 token 必須通過 HMAC-SHA256 簽章驗證才放行，
 * 否則一律踢去 /login 重新登入。
 *
 * 舊版（< 2026-05-26）cookie 值是字面 "true"，可被 devtools 偽造；現在
 * 是 v1.<issuedAt>.<HMAC> 三段格式，沒 SITE_AUTH_SECRET 簽不出來。舊
 * cookie 升級後自動失效，使用者一次性 re-login 即可拿到新 token。
 *
 * 注意 matcher 排除清單（見下方 config）：
 *   - /login                ：登入頁本身（含 server action POST 回此路徑）
 *   - /_next/static, image  ：Next.js 內部資源
 *   - /favicon.ico          ：tab icon
 *   - /api/line/webhook     ★：LINE 機器人從外部 POST 進來，沒 cookie，
 *                              絕不能擋，否則自動記帳會 fail
 *
 * Next 16 把 middleware 慣例改名為 proxy（檔名 + 函數名）。
 */
export async function proxy(request: NextRequest) {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) {
    // fail-safe：沒設 secret 就誰都不放行
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const auth = request.cookies.get(COOKIE_NAME);
  const ok = await verifyAuthToken(auth?.value, secret);
  if (ok) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    /*
     * 攔截所有 request 除了：
     *   - /login（含子路徑）
     *   - Next.js 內部：_next/static、_next/image
     *   - 靜態根檔：favicon.ico、robots.txt、sitemap.xml
     *   - LINE webhook：api/line/webhook
     *
     * 用 negative lookahead 一次列舉，比在 middleware body 裡寫 if 判斷
     * 更省 edge runtime cost（matcher 不通過就連 function 都不會跑）。
     */
    "/((?!login|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|api/line/webhook).*)",
  ],
};
