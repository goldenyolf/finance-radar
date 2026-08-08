import { getCurrentUserId } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import type { SubscriptionRow } from "@/lib/subscriptions";

/**
 * 撈當前登入會員的所有 subscriptions。
 * 抽出來成獨立檔避免 client component 透過 subscriptions.ts 間接 import
 * 到 server-only 的 next/headers。
 *
 * 顯式 .eq("user_id", uid) — subscriptions 表在 repo 的 migrations 裡從沒
 * ENABLE ROW LEVEL SECURITY 過，不能只靠 RLS scope。
 *
 * 失敗回空陣列：subscriptions 是非關鍵資料，撈不到不該讓首頁整個 500。
 */
export async function loadSubscriptions(): Promise<SubscriptionRow[]> {
  try {
    const uid = await getCurrentUserId();
    if (!uid) return [];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", uid)
      .order("next_billing_date", { ascending: true });
    if (error || !data) return [];
    return data as SubscriptionRow[];
  } catch {
    return [];
  }
}
