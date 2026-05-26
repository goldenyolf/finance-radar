import { createClient } from "@/lib/supabase/server";
import type { GoalRow } from "@/lib/goals";

/**
 * 撈當前登入會員的所有 goals。RLS policy 自動 scope，不用顯式 where user_id。
 * 抽出來成獨立檔避免 client component 透過 goals.ts 間接 import 到 server-only
 * 的 next/headers（cookies）。
 *
 * 失敗回空陣列；首頁不該因為這張表撈失敗就 500。
 */
export async function loadGoals(): Promise<GoalRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data as GoalRow[];
  } catch {
    return [];
  }
}
