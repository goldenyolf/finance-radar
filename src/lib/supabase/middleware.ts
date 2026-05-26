import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (middleware) 用的 Supabase client：每個 request 重新建一份，
 * 並把 supabase 寫的新 cookie 同步到 NextResponse 上，這樣 session refresh
 * 才能被瀏覽器收到。
 *
 * 注意：必須在 proxy 邊界呼叫 supabase.auth.getUser()，才會觸發 session
 * 刷新邏輯（必要時 supabase 會自動 rotate refresh token）。
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 觸發 session 刷新（不檢查回傳，由呼叫端決定要不要 redirect）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user, response: supabaseResponse };
}
