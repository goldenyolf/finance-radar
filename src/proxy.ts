import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "money_radar_auth";

/**
 * 全域 PIN 鎖：沒有 money_radar_auth=true cookie 一律踢去 /login。
 *
 * 注意 matcher 排除清單（見下方 config）：
 *   - /login                ：登入頁本身（含 server action POST 回此路徑）
 *   - /_next/static, image  ：Next.js 內部資源
 *   - /favicon.ico          ：tab icon
 *   - /api/line/webhook     ★：LINE 機器人從外部 POST 進來，沒 cookie，
 *                              絕不能擋，否則自動記帳會 fail
 *
 * Next 16 把 middleware 慣例改名為 proxy（檔名 + 函數名）。舊 middleware.ts
 * 還能跑但會發 deprecation warning，故直接用新名。
 */
export function proxy(request: NextRequest) {
  const auth = request.cookies.get(COOKIE_NAME);
  if (auth?.value === "true") {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
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
