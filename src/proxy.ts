import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * 全域 Supabase 會員守衛：每個 request 透過 @supabase/ssr 驗 session，
 * 沒登入 → 踢去 /login；同時順手刷新可能即將過期的 access token。
 *
 * 取代了之前的 HMAC PIN cookie 系統（auth-token.ts），auth 邊界改由
 * Supabase 提供，多用戶資料隔離靠 DB 上的 RLS policies 把關。
 *
 * matcher 排除清單（見下方 config）：
 *   - /about ★              ：服務介紹頁（公開行銷頁，未登入必須看得到；
 *                              漏掉它會造成 redirect 無限迴圈 — 未登入打
 *                              /about → 被攔 → redirect /about → 再被攔）
 *   - /login                ：登入/註冊頁本身
 *   - /forgot-password ★    ：發送重設密碼信頁（未登入專用）
 *   - /update-password ★    ：重設密碼頁（拿 Supabase recovery token 進來，
 *                              還沒有正式 session，必須允許未登入訪問）
 *   - /_next/static, image  ：Next.js 內部資源
 *   - /favicon.ico          ：tab icon
 *   - /api/line/webhook ★   ：LINE bot 從外部 POST 進來，沒有 user cookie
 *                              且簽章已被 LINE 簽過，不能擋；自己用
 *                              SUPABASE_SERVICE_ROLE_KEY 寫入
 *   - /api/cron             ：Vercel cron 用 CRON_SECRET 自驗，免登入
 */
export async function proxy(request: NextRequest) {
  const { user, response } = await updateSession(request);

  if (user) {
    return response;
  }

  /*
   * 未登入的分流 — 看他想去哪裡決定給他什麼：
   *
   *   打首頁 "/"     → /about
   *     打首頁的通常是第一次來的陌生人，他的問題是「這是什麼服務」，
   *     直接甩一個登入框給他等於什麼都沒說。先讓他看介紹頁。
   *
   *   打其他路徑     → /login
   *     知道 /transactions、/analytics 這種深層路徑的，是 session 剛過期的
   *     老用戶。他要的是登入框，把他丟去看行銷頁只是擋路。
   *
   * 註：目前沒有把原本要去的路徑帶進 /login（沒有 ?next= 參數），登入後一律
   * 回首頁。要做 deep-link 跳回的話是在這裡塞 searchParams，login 那邊再讀。
   */
  const target = request.nextUrl.pathname === "/" ? "/about" : "/login";
  return NextResponse.redirect(new URL(target, request.url));
}

export const config = {
  matcher: [
    "/((?!about|login|forgot-password|update-password|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|api/line/webhook|api/cron|auth/callback).*)",
  ],
};
