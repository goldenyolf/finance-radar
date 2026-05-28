import { createClient } from "@/lib/supabase/server";
import type { DashboardPlateRow } from "@/lib/dashboard-plates";

/**
 * 撈當前登入會員的所有戰情室板塊，依 sort_order ASC 再 created_at ASC。
 * RLS auto-scope；失敗回空陣列（settings 頁不該因這張表掛掉）。
 */
export async function loadDashboardPlates(): Promise<DashboardPlateRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dashboard_plates")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data as DashboardPlateRow[];
  } catch {
    return [];
  }
}
