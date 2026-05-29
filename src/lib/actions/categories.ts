"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { CategoryType } from "@/lib/categories";

export interface CreateCategoryInput {
  name: string;
  type: CategoryType;
  color: string;
  keywords: string;
  /** 每月預算上限；0 = 不設預算（圓餅圖不顯示進度條 / LINE bot 不警告）。 */
  budget_monthly: number;
  /** LINE bot fallback chain (B) — 分類層預設帳戶；null = 不指定，往下層退。 */
  default_account_id: string | null;
}

export interface UpdateCategoryInput extends CreateCategoryInput {
  id: string;
}

export type MutationResult = { ok: true } | { ok: false; error: string };

const HEX_RE = /^#[0-9a-f]{6}$/i;

function validate(input: CreateCategoryInput): string | null {
  if (!input.name.trim()) return "請輸入分類名稱";
  if (!HEX_RE.test(input.color)) return "顏色必須是 #RRGGBB 格式";
  if (input.type !== "expense" && input.type !== "income") {
    return "分類類型錯誤";
  }
  if (!Number.isFinite(input.budget_monthly) || input.budget_monthly < 0) {
    return "預算必須是 0 或正整數";
  }
  return null;
}

export async function createCategory(
  input: CreateCategoryInput
): Promise<MutationResult> {
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  // code = null 代表使用者自訂；RLS WITH CHECK 要求 auth.uid() = user_id，所以這裡明寫
  // user_id（不靠 DB DEFAULT，避免 column default 缺失時 RLS 直接 42501 拒絕）
  const { error } = await supabase.from("categories").insert({
    user_id: userData.user.id,
    name: input.name.trim(),
    type: input.type,
    color: input.color,
    keywords: input.keywords.trim(),
    budget_monthly: input.budget_monthly,
    default_account_id: input.default_account_id,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/analytics");
  return { ok: true };
}

export async function updateCategory(
  input: UpdateCategoryInput
): Promise<MutationResult> {
  if (!input.id) return { ok: false, error: "缺少分類 ID" };
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  // 注意：code 欄位刻意不允許 update — built-in 7 大分類的 code 是穩定識別子，
  // 預算邏輯與舊 transactions backfill 都依賴它。只允許改 name/color/keywords。
  const { error } = await supabase
    .from("categories")
    .update({
      name: input.name.trim(),
      type: input.type,
      color: input.color,
      keywords: input.keywords.trim(),
      budget_monthly: input.budget_monthly,
      default_account_id: input.default_account_id,
    })
    .eq("id", input.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/analytics");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<MutationResult> {
  if (!id) return { ok: false, error: "缺少分類 ID" };

  const supabase = await createClient();

  // 防呆：built-in 七大類（code != null）禁止刪除，會破壞預算系統 + LLM prompt
  const { data: row, error: fetchErr } = await supabase
    .from("categories")
    .select("code")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!row) return { ok: false, error: "找不到該分類" };
  if (row.code) {
    return {
      ok: false,
      error: "預設分類無法刪除，僅可編輯名稱 / 顏色 / 關鍵字",
    };
  }

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/analytics");
  return { ok: true };
}
