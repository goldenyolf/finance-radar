import { createClient } from "@/lib/supabase/server";

/**
 * 通知中心要展示的「待確認」週期性交易。
 * 故意精簡欄位 — Popover row 只需要這幾個，少塞網路流量。
 */
export interface PlaceholderTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  /** 用來把 row category dot 染色 — caller 可選擇要不要顯示 */
  category: string | null;
}

/**
 * 撈當月所有 fulfillment_state='placeholder' 的交易。
 *
 * 限本月：避免歷史欠補的 placeholder（不太可能但 safety net）一直 follow
 * 在通知裡讓 user 焦慮 — 「逾月未補」應該另開 reminder 通道，不是塞通知中心。
 *
 * RLS 已 scope by auth.uid()，不需手動 .eq('user_id')。
 * 失敗 / 0015 未跑 / 表結構漂 → 一律安靜回空陣列，UI 走「全核銷完畢」分支。
 */
export async function loadPlaceholders(): Promise<PlaceholderTransaction[]> {
  try {
    const supabase = await createClient();
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    // 下月 1 號（用 < 比較避免月底 day 邊界）
    const nm = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
    const ny = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const nextMonthStart = `${ny}-${String(nm + 1).padStart(2, "0")}-01`;

    const { data, error } = await supabase
      .from("transactions")
      .select("id, description, amount, date, category")
      .eq("fulfillment_state", "placeholder")
      .gte("date", monthStart)
      .lt("date", nextMonthStart)
      .order("date", { ascending: true });

    if (error || !data) return [];

    return data.map((r) => ({
      id: String(r.id),
      description: String(r.description ?? "（無說明）"),
      amount: Number(r.amount),
      date: String(r.date),
      category: r.category ? String(r.category) : null,
    }));
  } catch {
    return [];
  }
}
