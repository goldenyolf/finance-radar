import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 夢想基金提撥 — 網頁端 server action 與 LINE webhook 共用的單一實作。
 *
 * 為什麼要抽出來：兩邊原本各有一份 read-modify-write，
 *   1) SELECT current_amount
 *   2) UPDATE SET current_amount = <讀到的值> + amount
 * 兩條併發就互相覆蓋、少記一筆。而 LINE webhook 的 POST handler 是
 *   await Promise.all((body.events ?? []).map(handleEvent))
 * —— 同一個 payload 帶兩則「提撥 500」時真的會併發，不是理論值。
 *
 * 改走 add_goal_funds() RPC（per 0034），把「讀 + 加」壓進單一
 * `UPDATE ... SET x = x + n`，由 PG 的 row lock 保證原子性。
 *
 * RPC 不存在時（migration 還沒手動跑）自動退回舊的兩步式寫法，維持功能可用
 * ——跟 loadDashboard 對 materialize_due_recurrings 的處理同一套慣例。
 */

type Db = SupabaseClient;

export interface GoalDepositResult {
  ok: boolean;
  error?: string;
  /** 提撥後的新累積金額 */
  newAmount?: number;
  /** 提撥後是否「跨過 100% 達標門檻」（從未達標 → 達標的那一次） */
  justCompleted?: boolean;
  /** 目標金額，給呼叫端算百分比用 */
  targetAmount?: number;
}

/** PostgREST 找不到該 function（schema cache）/ PG 找不到該 function。 */
function isMissingFunction(code: string | undefined): boolean {
  return code === "PGRST202" || code === "42883";
}

/**
 * @param goalId 目標 id
 * @param userId 擁有者 —— 顯式傳入而非靠 auth.uid()，因為 LINE webhook 走
 *               service role client 沒有 JWT。RPC 內部會擋跨租戶呼叫。
 */
export async function depositToGoal(
  supabase: Db,
  goalId: string,
  userId: string,
  amount: number
): Promise<GoalDepositResult> {
  if (!goalId) return { ok: false, error: "缺少目標 ID" };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "提撥金額必須為大於 0 的數字" };
  }

  const rpcRes = await supabase.rpc("add_goal_funds", {
    p_goal_id: goalId,
    p_user_id: userId,
    p_amount: amount,
  });

  if (rpcRes.error && !isMissingFunction(rpcRes.error.code)) {
    return { ok: false, error: rpcRes.error.message };
  }

  let previousAmount: number;
  let newAmount: number;
  let targetAmount: number;

  if (rpcRes.error) {
    // RPC 不存在 → 退回兩步式（race 仍在，但功能可用）
    console.warn(
      "[goal-deposit] add_goal_funds RPC 不存在，退回非原子的兩步式寫法；請跑 0034 migration"
    );
    const fallback = await depositFallback(supabase, goalId, userId, amount);
    if (!fallback.ok) return fallback;
    previousAmount = fallback.previousAmount!;
    newAmount = fallback.newAmount!;
    targetAmount = fallback.targetAmount!;
  } else {
    const rows = (rpcRes.data ?? []) as Array<{
      previous_amount: number | string;
      new_amount: number | string;
      target_amount: number | string;
    }>;
    // 0 rows = goal 不存在或不屬於這個 user（RPC 內用 user_id 過濾）
    if (rows.length === 0) return { ok: false, error: "找不到該目標" };
    previousAmount = Number(rows[0].previous_amount);
    newAmount = Number(rows[0].new_amount);
    targetAmount = Number(rows[0].target_amount);
  }

  // audit log — 失敗不 rollback 金額（log 只是紀錄，金額對了就算成功）
  const { error: logErr } = await supabase.from("goal_logs").insert({
    goal_id: goalId,
    user_id: userId,
    amount,
  });
  if (logErr) {
    console.error("[goal-deposit] goal_logs insert 失敗（金額已更新）:", logErr);
  }

  return {
    ok: true,
    newAmount,
    targetAmount,
    justCompleted: previousAmount < targetAmount && newAmount >= targetAmount,
  };
}

/** 舊的兩步式路徑 — 只在 RPC 缺席時使用。 */
async function depositFallback(
  supabase: Db,
  goalId: string,
  userId: string,
  amount: number
): Promise<{
  ok: boolean;
  error?: string;
  previousAmount?: number;
  newAmount?: number;
  targetAmount?: number;
}> {
  const { data: goal, error: fetchErr } = await supabase
    .from("goals")
    .select("current_amount, target_amount")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!goal) return { ok: false, error: "找不到該目標" };

  const previousAmount = Number(goal.current_amount);
  const targetAmount = Number(goal.target_amount);
  const newAmount = previousAmount + amount;

  const { error: updateErr, count } = await supabase
    .from("goals")
    .update({ current_amount: newAmount }, { count: "exact" })
    .eq("id", goalId)
    .eq("user_id", userId);
  if (updateErr) return { ok: false, error: updateErr.message };
  if (!count) return { ok: false, error: "找不到該目標（或不屬於你）" };

  return { ok: true, previousAmount, newAmount, targetAmount };
}
