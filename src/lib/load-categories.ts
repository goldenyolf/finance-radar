import { createClient } from "@/lib/supabase/server";
import type { CategoryRow } from "@/lib/categories";

/**
 * 撈當前登入會員的所有 categories（RLS 自動 scope）。
 * 失敗回空陣列（首頁不該因 categories 撈失敗就 500）。
 *
 * 排序：built-in code 先 by code 字母序，自訂分類（code = null）按
 * created_at 排後面，這樣 UI 列舉時預設分類在前、客製分類在後。
 */
export async function loadCategories(): Promise<CategoryRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("code", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data as CategoryRow[];
  } catch {
    return [];
  }
}
