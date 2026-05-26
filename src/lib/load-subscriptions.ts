import { createClient } from "@/lib/supabase/server";
import type { SubscriptionRow } from "@/lib/subscriptions";

/**
 * 撈當前登入會員的所有 subscriptions（RLS 自動 scope）。
 * 抽出來成獨立檔避免 client component 透過 subscriptions.ts 間接 import
 * 到 server-only 的 next/headers。
 *
 * 失敗回空陣列：subscriptions 是非關鍵資料，撈不到不該讓首頁整個 500。
 */
export async function loadSubscriptions(): Promise<SubscriptionRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .order("next_billing_date", { ascending: true });
    if (error || !data) return [];
    return data as SubscriptionRow[];
  } catch {
    return [];
  }
}
