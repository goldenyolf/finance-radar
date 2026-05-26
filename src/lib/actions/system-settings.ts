"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  BUDGET_CATEGORIES,
  budgetKey,
  SETTING_KEY_SAFETY_THRESHOLD,
  type BudgetCategory,
} from "@/lib/system-settings";

export interface SaveSettingsInput {
  safetyThreshold: number;
  budgets: Partial<Record<BudgetCategory, number>>;
}

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * Upsert 全部設定。值 = 0 視為「未設定」依然會寫入（讓使用者明確「清空」）。
 *
 * 為什麼不 try/catch supabase error 後 swallow：let it bubble，讓 client
 * useActionState 拿到完整錯誤訊息（例如表不存在 → 提示使用者跑 SQL migration）。
 */
export async function saveSystemSettings(
  input: SaveSettingsInput
): Promise<MutationResult> {
  // 1. 收集要 upsert 的 rows
  const rows: Array<{ key: string; value: number }> = [];

  // safety threshold
  if (Number.isFinite(input.safetyThreshold) && input.safetyThreshold >= 0) {
    rows.push({
      key: SETTING_KEY_SAFETY_THRESHOLD,
      value: input.safetyThreshold,
    });
  }

  // 各分類預算
  for (const cat of BUDGET_CATEGORIES) {
    const v = input.budgets[cat];
    if (v === undefined || v === null) continue;
    if (!Number.isFinite(v) || v < 0) continue;
    rows.push({ key: budgetKey(cat), value: v });
  }

  if (rows.length === 0) {
    return { ok: false, error: "沒有有效的設定值可儲存" };
  }

  const supabase = await createClient();
  // system_settings PK 改成 (user_id, key) 複合鍵；upsert 需要顯式 user_id
  // 才能正確 conflict 到「同一個使用者的同一個 key」
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, error: "尚未登入，無法儲存設定" };
  }

  const rowsWithUser = rows.map((r) => ({ ...r, user_id: userData.user.id }));

  const { error } = await supabase
    .from("system_settings")
    .upsert(rowsWithUser, { onConflict: "user_id,key" });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true };
}
