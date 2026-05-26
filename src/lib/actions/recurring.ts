"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type RecurringType = "income" | "expense";
export type RecurringFrequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semi_annually"
  | "yearly";

export interface CreateRecurringInput {
  /** Deprecated：後端走 auth.uid()，這個欄位忽略；保留是為了避免改 caller */
  userId?: string;
  accountId: string | null;
  title: string;
  amount: number;
  type: RecurringType;
  frequency: RecurringFrequency;
  nextDueDate: string;
}

export type MutationResult = { ok: true } | { ok: false; error: string };

export async function createRecurring(
  input: CreateRecurringInput
): Promise<MutationResult> {
  if (!input.title.trim()) return { ok: false, error: "請輸入項目名稱" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "金額必須為大於 0 的數字" };
  }
  if (!input.nextDueDate) return { ok: false, error: "請選擇下次執行日期" };

  const supabase = await createClient();
  // user_id 走 DB DEFAULT auth.uid()，這裡不傳；RLS policy 也用 auth.uid() 驗
  const { error } = await supabase.from("recurring_payments").insert({
    id: randomUUID(),
    account_id: input.accountId,
    title: input.title.trim(),
    amount: input.amount,
    type: input.type,
    frequency: input.frequency,
    next_due_date: input.nextDueDate,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/recurring");
  return { ok: true };
}

export interface UpdateRecurringInput {
  id: string;
  accountId: string | null;
  title: string;
  amount: number;
  type: RecurringType;
  frequency: RecurringFrequency;
  nextDueDate: string;
}

export async function updateRecurring(
  input: UpdateRecurringInput
): Promise<MutationResult> {
  if (!input.id) return { ok: false, error: "缺少項目 ID" };
  if (!input.title.trim()) return { ok: false, error: "請輸入項目名稱" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "金額必須為大於 0 的數字" };
  }
  if (!input.nextDueDate) return { ok: false, error: "請選擇下次執行日期" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_payments")
    .update({
      account_id: input.accountId,
      title: input.title.trim(),
      amount: input.amount,
      type: input.type,
      frequency: input.frequency,
      next_due_date: input.nextDueDate,
    })
    .eq("id", input.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/recurring");
  return { ok: true };
}

export async function deleteRecurring(id: string): Promise<MutationResult> {
  if (!id) return { ok: false, error: "缺少項目 ID" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_payments")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/recurring");
  return { ok: true };
}
