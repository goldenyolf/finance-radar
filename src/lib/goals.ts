import { supabase } from "@/lib/supabase";

/**
 * 夢想基金（Goal Tracker）— 跟其他金流概念都不同的「儲蓄目標」：
 *   - goals       ：每個目標一筆，target / current / deadline / image
 *   - goal_logs   ：每次提撥的明細，用來日後可視化 / 回溯
 *
 * 跟 transactions 不混表的原因：goal 是「資金內部分配」概念，不是真的
 * 從帳戶扣錢。current_amount 是抽象的「我心理上分配給這目標多少錢」，
 * 跟銀行餘額無關。混在 transactions 會污染 forecast / spending 統計。
 */

export interface GoalRow {
  id: string;
  name: string;
  target_amount: number | string;
  current_amount: number | string;
  /** ISO date "YYYY-MM-DD" — 預計達成日 */
  deadline: string | null;
  image_url: string | null;
  created_at?: string;
}

export interface GoalLogRow {
  id: string;
  goal_id: string;
  amount: number | string;
  created_at: string;
}

/** 失敗回空陣列；首頁不該因為這張表撈失敗就 500。 */
export async function loadGoals(): Promise<GoalRow[]> {
  try {
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

/** 進度百分比；超過 100% 也維持實際值給達成 badge 用，UI 顯示再 clamp。 */
export function goalPercent(goal: GoalRow): number {
  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);
  if (!Number.isFinite(target) || target <= 0) return 0;
  return (current / target) * 100;
}

/**
 * deadline 倒數天數。null = 沒設 deadline。
 * Taipei 時區基準（跟訂閱算法保持一致）。
 */
export function daysUntilDeadline(
  deadline: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!deadline) return null;
  const target = new Date(`${deadline}T00:00:00+08:00`);
  if (Number.isNaN(target.getTime())) return null;

  const nowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayTaipei = new Date(`${nowParts}T00:00:00+08:00`);

  const ms = target.getTime() - todayTaipei.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
