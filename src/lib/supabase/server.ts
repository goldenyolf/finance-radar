import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client：用在 Server Components、Server Actions、Route Handlers。
 *
 * 跟舊 `src/lib/supabase.ts` 的差別：
 *   - 舊版用單例 anon client，所有人共用同一個沒身份的 connection
 *   - 新版每次 request 重新建 client，並從 cookies 帶上使用者 session
 *     → supabase 知道現在是誰登入 → auth.uid() 有值 → RLS policy 才能驗
 *
 * 用法（在 RSC 或 server action 內）：
 *   const supabase = await createClient();
 *   const { data } = await supabase.from('transactions').select('*');
 *   // RLS 自動只回傳當前使用者的 row
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component 內呼叫 cookieStore.set 會拋；可以忽略，
            // 因為 middleware 已經負責刷新 session cookie 了。
          }
        },
      },
    }
  );
}
