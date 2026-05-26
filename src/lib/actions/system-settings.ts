"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { SETTING_KEY_SAFETY_THRESHOLD } from "@/lib/system-settings";

export interface SaveSettingsInput {
  safetyThreshold: number;
}

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * Upsert 全域安全門檻。Phase 5 之後 per-category budgets 改存 categories
 * 表，這裡只剩單一 key。輸入 0 也會被寫入（讓使用者明確清空門檻）。
 */
export async function saveSystemSettings(
  input: SaveSettingsInput
): Promise<MutationResult> {
  if (!Number.isFinite(input.safetyThreshold) || input.safetyThreshold < 0) {
    return { ok: false, error: "門檻必須是 0 或正整數" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, error: "尚未登入，無法儲存設定" };
  }

  const { error } = await supabase.from("system_settings").upsert(
    {
      user_id: userData.user.id,
      key: SETTING_KEY_SAFETY_THRESHOLD,
      value: input.safetyThreshold,
    },
    { onConflict: "user_id,key" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true };
}
