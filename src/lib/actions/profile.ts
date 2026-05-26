"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * 綁定 LINE userId 到當前登入會員的 profile。
 * Upsert：第一次叫 insert，之後覆蓋。
 *
 * 注意：line_user_id 在 profiles 表有 UNIQUE constraint，所以同一個
 * LINE 帳號不能綁到兩個會員身上 — 衝突時回傳明確錯誤訊息。
 */
export async function bindLineUserId(
  lineUserId: string
): Promise<MutationResult> {
  const cleaned = lineUserId.trim();
  if (!cleaned) return { ok: false, error: "請輸入你的 LINE User ID" };
  // LINE User ID 格式：U 開頭 + 32 hex chars，共 33 字
  if (!/^U[0-9a-f]{32}$/i.test(cleaned)) {
    return {
      ok: false,
      error: "格式錯誤：LINE User ID 應為 U 開頭 + 32 字小寫 hex",
    };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: userData.user.id,
      line_user_id: cleaned,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    if (/duplicate key value/i.test(error.message)) {
      return {
        ok: false,
        error: "這個 LINE User ID 已被其他會員綁定",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function unbindLineUserId(): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  const { error } = await supabase
    .from("profiles")
    .update({ line_user_id: null, updated_at: new Date().toISOString() })
    .eq("user_id", userData.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
