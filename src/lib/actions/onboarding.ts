"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * 把當前登入使用者的 profiles.has_completed_onboarding 翻成 true。
 *
 * 用 UPSERT 防御：理論上 profile row 由 handle_new_user trigger 在
 * 註冊時就建好，但萬一漏掉（例如老用戶 trigger 出 bug 之前註冊的）
 * 也能補一條進去。`user_id` 對應 auth.uid()，是 profiles 的 PK。
 *
 * 這支 action 設計成「一次性 idempotent」— 重複呼叫第二次以後就是
 * no-op（值已經是 true）。
 */
export async function completeOnboarding(): Promise<MutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "未登入" };

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      has_completed_onboarding: true,
    },
    { onConflict: "user_id" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true };
}
