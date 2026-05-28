import { UpdatePasswordCard } from "./update-password-card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 重設密碼頁 — Supabase 寄出的 magic link 點下去的目的地。
 *
 * Supabase 帶 access_token 在 URL fragment（#access_token=xxx&type=recovery...），
 * 伺服器**看不到** fragment（只有 browser 看得到），所以這頁不能做
 * server-side session 判斷 / redirect — 全部交給 client component。
 *
 * `@supabase/ssr` 的 createBrowserClient 預設 detectSessionInUrl=true，
 * 元件 mount 時會自動讀 fragment 把 recovery session 建起來，之後呼叫
 * supabase.auth.updateUser({ password }) 才會成功。
 */
export default function UpdatePasswordPage() {
  return <UpdatePasswordCard />;
}
