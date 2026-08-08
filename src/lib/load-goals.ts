import { getCurrentUserId } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import type { GoalRow } from "@/lib/goals";

/**
 * 撈當前登入會員的所有 goals。
 * 抽出來成獨立檔避免 client component 透過 goals.ts 間接 import 到 server-only
 * 的 next/headers（cookies）。
 *
 * 顯式 .eq("user_id", uid) — goals 表在 repo 的 migrations 裡從沒 ENABLE
 * ROW LEVEL SECURITY 過，不能只靠 RLS scope。
 *
 * 失敗回空陣列；首頁不該因為這張表撈失敗就 500。
 */
export async function loadGoals(): Promise<GoalRow[]> {
  try {
    const uid = await getCurrentUserId();
    if (!uid) return [];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data as GoalRow[];
  } catch {
    return [];
  }
}
