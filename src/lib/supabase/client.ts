import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client：用在 "use client" component。
 *
 * 主要用途：
 *   - 登入頁呼叫 supabase.auth.signInWithPassword / signUp
 *   - 客戶端 component 直接 query supabase（如 transactions-view 即時搜尋）
 *   - 登出按鈕呼叫 supabase.auth.signOut
 *
 * 自動從瀏覽器 cookie 讀 session，所以 auth.uid() 有值、RLS 自動 scope。
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
