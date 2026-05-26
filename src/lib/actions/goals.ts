"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export interface CreateGoalInput {
  name: string;
  targetAmount: number;
  deadline?: string | null; // YYYY-MM-DD or null
  imageUrl?: string | null;
}

export type MutationResult = { ok: true } | { ok: false; error: string };

function validateGoal(input: CreateGoalInput): string | null {
  if (!input.name.trim()) return "請輸入目標名稱";
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
    return "目標金額必須為大於 0 的數字";
  }
  if (input.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(input.deadline)) {
    return "截止日期格式錯誤";
  }
  return null;
}

export async function createGoal(
  input: CreateGoalInput
): Promise<MutationResult> {
  const err = validateGoal(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  // user_id 走 DB DEFAULT auth.uid()
  const { error } = await supabase.from("goals").insert({
    name: input.name.trim(),
    target_amount: input.targetAmount,
    current_amount: 0,
    deadline: input.deadline || null,
    image_url: input.imageUrl?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true };
}

export async function deleteGoal(id: string): Promise<MutationResult> {
  if (!id) return { ok: false, error: "缺少目標 ID" };
  const supabase = await createClient();
  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true };
}

export interface AddFundsResult {
  ok: boolean;
  error?: string;
  /** 提撥後的新累積金額；成功時帶上來給呼叫端做 100% 達成判斷 */
  newCurrentAmount?: number;
  /** 提撥後是否「跨過 100% 達標門檻」（從未達標 → 達標的那一次） */
  justCompleted?: boolean;
}

/**
 * 兩步式：read 現值 → update += amount → insert goal_logs。
 *
 * 不開 Supabase RPC 是為了維持「全部設定在 web app 端、不動 DB schema」
 * 的習慣。單一使用者場景下沒有 race condition；多人共用要改寫成 RPC
 * 或 transaction。
 *
 * justCompleted flag 讓 client 端用來決定要不要噴 confetti — 比
 * 「前後 amount 比對」更可靠（後端是唯一可信來源）。
 */
export async function addFundsToGoal(
  goalId: string,
  amount: number
): Promise<AddFundsResult> {
  if (!goalId) return { ok: false, error: "缺少目標 ID" };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "提撥金額必須為大於 0 的數字" };
  }

  const supabase = await createClient();
  // 1. 撈現值 + target
  const { data: goal, error: fetchErr } = await supabase
    .from("goals")
    .select("current_amount, target_amount")
    .eq("id", goalId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!goal) return { ok: false, error: "找不到該目標" };

  const current = Number(goal.current_amount);
  const target = Number(goal.target_amount);
  const newAmount = current + amount;
  const justCompleted = current < target && newAmount >= target;

  // 2. update goals
  const { error: updateErr } = await supabase
    .from("goals")
    .update({ current_amount: newAmount })
    .eq("id", goalId);
  if (updateErr) return { ok: false, error: updateErr.message };

  // 3. insert log（即使這步失敗，前面的金額已更新，視為部分成功）
  const { error: logErr } = await supabase.from("goal_logs").insert({
    goal_id: goalId,
    amount,
  });
  if (logErr) {
    console.error("[goals] log insert failed (current_amount 已更新):", logErr);
    // 不 return error，仍視為成功 — 金額對了就 OK，log 只是 audit trail
  }

  revalidatePath("/");
  return {
    ok: true,
    newCurrentAmount: newAmount,
    justCompleted,
  };
}
