"use server";

import { revalidatePath } from "next/cache";

import { depositToGoal } from "@/lib/goal-deposit";
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
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  // user_id 顯式寫入而非靠 DB DEFAULT auth.uid() — DEFAULT 缺失時會寫成
  // NULL 變成孤兒 row，顯式寫至少會撞 NOT NULL 早 fail。
  const { error } = await supabase.from("goals").insert({
    user_id: userData.user.id,
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
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  const { error, count } = await supabase
    .from("goals")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", userData.user.id);
  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "找不到該目標（或不屬於你）" };
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
 * 提撥金額。實作在 lib/goal-deposit.ts —— 跟 LINE webhook 的 tryGoalDeposit
 * 共用同一份，走 add_goal_funds() RPC 做原子加值（per 0034）。
 *
 * 原本這裡是 read-modify-write 兩步式，註解寫「單一使用者場景沒有 race
 * condition」；但 webhook 那份是併發跑的（Promise.all over events），同一份
 * 邏輯兩種正確性假設站不住腳，索性統一成原子版本。
 *
 * justCompleted flag 讓 client 端用來決定要不要噴 confetti — 比
 * 「前後 amount 比對」更可靠（後端是唯一可信來源）。
 */
export async function addFundsToGoal(
  goalId: string,
  amount: number
): Promise<AddFundsResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  const result = await depositToGoal(
    supabase,
    goalId,
    userData.user.id,
    amount
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return {
    ok: true,
    newCurrentAmount: result.newAmount,
    justCompleted: result.justCompleted,
  };
}
