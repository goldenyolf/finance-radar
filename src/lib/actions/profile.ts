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

/* ─────────────────── 個人設定（display_name + 儲蓄率目標） ─────────────────── */

export interface UpdateProfileInput {
  /** 暱稱；空字串 → 寫 null 表示「未設定」 */
  display_name: string;
  /** 0-100 之間的數字（百分比） */
  target_savings_rate: number;
  /** LINE bot fallback chain (C)；null = 不指定，走 (D) first account */
  default_account_id: string | null;
}

/**
 * 更新個人設定。
 *
 * 用 UPSERT 而非 UPDATE：理論上 profile row 由 handle_new_user trigger 在
 * 註冊瞬間建好，但萬一漏掉（老用戶在 trigger 之前註冊）也能補上去。
 *
 * 三層驗證：
 *   1) Client（card 元件）：HTML5 type=number + min/max 擋住明顯爛值
 *   2) Server（這支）：再驗一次防 client tamper / 直接打 server action
 *   3) DB：profiles_target_savings_rate_check 0-100 CHECK constraint 兜底
 *
 * revalidatePath 同時刷 3 條：
 *   /          → 首頁歡迎詞會吃 display_name
 *   /settings  → 自己這頁 refresh 顯示新值
 *   /analytics → 跨月趨勢圖會吃 target_savings_rate 畫目標虛線
 */
export async function updateProfile(
  input: UpdateProfileInput
): Promise<MutationResult> {
  if (!Number.isFinite(input.target_savings_rate)) {
    return { ok: false, error: "儲蓄率目標必須是數字" };
  }
  if (input.target_savings_rate < 0 || input.target_savings_rate > 100) {
    return { ok: false, error: "儲蓄率目標必須在 0–100% 之間" };
  }

  const trimmedName = input.display_name.trim();
  if (trimmedName.length > 50) {
    return { ok: false, error: "暱稱請控制在 50 字以內" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "尚未登入" };

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      display_name: trimmedName || null,
      target_savings_rate: input.target_savings_rate,
      default_account_id: input.default_account_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/analytics");
  return { ok: true };
}
