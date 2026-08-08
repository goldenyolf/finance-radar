import { getCurrentUserId } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import type { CategoryRow } from "@/lib/categories";

/**
 * 撈當前登入會員的所有 categories。
 * 失敗回空陣列（首頁不該因 categories 撈失敗就 500）。
 *
 * 顯式 .eq("user_id", uid) — categories 表在 repo 的 migrations 裡從沒
 * ENABLE ROW LEVEL SECURITY 過，不能只靠 RLS scope。
 *
 * 排序：built-in code 先 by code 字母序，自訂分類（code = null）按
 * created_at 排後面，這樣 UI 列舉時預設分類在前、客製分類在後。
 */
export async function loadCategories(): Promise<CategoryRow[]> {
  try {
    const uid = await getCurrentUserId();
    if (!uid) return [];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("user_id", uid)
      .order("code", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data as CategoryRow[];
  } catch {
    return [];
  }
}
