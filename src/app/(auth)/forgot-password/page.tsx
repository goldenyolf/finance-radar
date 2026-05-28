import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ForgotPasswordCard } from "./forgot-password-card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 忘記密碼頁 — 收 email 後呼叫 supabase.auth.resetPasswordForEmail，
 * Supabase 寄出含 access_token 的 magic link 到使用者信箱。
 *
 * 跟 /login 同款：已登入直接 redirect / — 沒理由讓登入中的使用者進來。
 */
export default async function ForgotPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return <ForgotPasswordCard />;
}
