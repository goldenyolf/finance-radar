import { createClient } from "@supabase/supabase-js";

/**
 * Service role Supabase client — **完全繞過 RLS**，僅供需要跨使用者寫入的
 * 後端權威場景使用：
 *   - LINE webhook（沒有 user session，靠 profiles.line_user_id 查身份）
 *   - Vercel cron job（系統服務，需掃所有使用者的訂閱）
 *
 * 警告：service_role key 等同 root 權限，絕不能在 client component / browser
 * bundle 出現。這個 helper 只能在 server route handlers 內 import。
 *
 * 必要環境變數：SUPABASE_SERVICE_ROLE_KEY
 *   Supabase Dashboard → Settings → API → 找「service_role」key（標記 secret）
 *   貼到 Vercel env vars，**勾 Sensitive**（cron / webhook 都是 Node runtime，
 *   讀得到 Sensitive 變數）
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 環境變數"
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      // service role 不需要 session 持久化
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
