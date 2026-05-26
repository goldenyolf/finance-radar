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
 *   - /login                ：登入/註冊頁本身
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

  // 未登入 → redirect /login（保留原本要訪問的路徑，以便登入後跳回）
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!login|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|api/line/webhook|api/cron|auth/callback).*)",
  ],
};
