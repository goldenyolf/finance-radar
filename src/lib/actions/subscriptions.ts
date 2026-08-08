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
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  // user_id 顯式寫入而非靠 DB DEFAULT auth.uid()（DEFAULT 缺失會寫成孤兒 row）
  const { error } = await supabase.from("subscriptions").insert({
    user_id: userData.user.id,
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
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  const { error, count } = await supabase
    .from("subscriptions")
    .update(
      {
        name: input.name.trim(),
        amount: input.amount,
        billing_cycle: input.billingCycle,
        next_billing_date: input.nextBillingDate,
        account_id: input.accountId,
        category: input.category?.trim() || "固定支出",
        // 刻意不動 last_alerted_billing_date（per 0033）：使用者改扣款日後，
        // 舊標記等於舊日期、跟新的 next_billing_date 不相等，cron 的
        // `last_alerted === next_billing` 去重條件自然不成立，照樣會提醒。
        // 不寫這欄也讓本檔不依賴 0033 是否已套用。
      },
      { count: "exact" }
    )
    .eq("id", input.id)
    .eq("user_id", userData.user.id);

  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "找不到該訂閱（或不屬於你）" };

  revalidatePath("/");
  return { ok: true };
}

export async function deleteSubscription(
  id: string
): Promise<MutationResult> {
  if (!id) return { ok: false, error: "缺少訂閱 ID" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  const { error, count } = await supabase
    .from("subscriptions")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", userData.user.id);

  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "找不到該訂閱（或不屬於你）" };

  revalidatePath("/");
  return { ok: true };
}
