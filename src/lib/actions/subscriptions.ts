"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { BillingCycle } from "@/lib/subscriptions";

export interface CreateSubscriptionInput {
  name: string;
  amount: number;
  billingCycle: BillingCycle;
  nextBillingDate: string; // YYYY-MM-DD
  accountId: string;
  category?: string;
}

export interface UpdateSubscriptionInput extends CreateSubscriptionInput {
  id: string;
}

export type MutationResult = { ok: true } | { ok: false; error: string };

function validate(input: CreateSubscriptionInput): string | null {
  if (!input.name.trim()) return "請輸入訂閱名稱";
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return "金額必須為大於 0 的數字";
  }
  if (input.billingCycle !== "monthly" && input.billingCycle !== "yearly") {
    return "扣款週期格式錯誤";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextBillingDate)) {
    return "下次扣款日期格式錯誤（需 YYYY-MM-DD）";
  }
  if (!input.accountId) return "請選擇扣款帳戶";
  return null;
}

export async function createSubscription(
  input: CreateSubscriptionInput
): Promise<MutationResult> {
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  // user_id 走 DB DEFAULT auth.uid()
  const { error } = await supabase.from("subscriptions").insert({
    name: input.name.trim(),
    amount: input.amount,
    billing_cycle: input.billingCycle,
    next_billing_date: input.nextBillingDate,
    account_id: input.accountId,
    category: input.category?.trim() || "固定支出",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true };
}

export async function updateSubscription(
  input: UpdateSubscriptionInput
): Promise<MutationResult> {
  if (!input.id) return { ok: false, error: "缺少訂閱 ID" };
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({
      name: input.name.trim(),
      amount: input.amount,
      billing_cycle: input.billingCycle,
      next_billing_date: input.nextBillingDate,
      account_id: input.accountId,
      category: input.category?.trim() || "固定支出",
    })
    .eq("id", input.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true };
}

export async function deleteSubscription(
  id: string
): Promise<MutationResult> {
  if (!id) return { ok: false, error: "缺少訂閱 ID" };

  const supabase = await createClient();
  const { error } = await supabase.from("subscriptions").delete().eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true };
}
