"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { supabase } from "@/lib/supabase";

import type { ExpenseCategory } from "@/lib/dashboard";

export type TransactionType = "income" | "expense" | "transfer";
export type TransactionPriority = "essential" | "non_essential";
export type TransactionStatus = "completed" | "upcoming";
export type TransferDirection = "out" | "in";

export interface CreateTransactionInput {
  userId: string;
  accountId: string;
  description: string;
  amount: number;
  type: Exclude<TransactionType, "transfer">;
  priority: TransactionPriority;
  /** 花費大類；未提供時 server 端套用 'other' 預設值，由 DB 預設或這裡顯式填入。 */
  category?: ExpenseCategory;
  status: TransactionStatus;
  date: string;
}

export interface CreateTransferInput {
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  description: string;
  amount: number;
  status: TransactionStatus;
  date: string;
}

export type MutationResult = { ok: true } | { ok: false; error: string };

export interface UpdateTransactionInput {
  id: string;
  description: string;
  amount: number;
  /** 可選；變更才傳。Transfer 改帳戶會破壞配對，這欄位對 transfer 不生效。 */
  accountId?: string;
  /** 可選；變更才傳。Transfer 沒有花費分類概念，這欄位對 transfer 不生效。 */
  category?: ExpenseCategory;
}

export async function updateTransaction(
  input: UpdateTransactionInput
): Promise<MutationResult> {
  if (!input.id) return { ok: false, error: "缺少交易 ID" };
  if (!input.description.trim()) return { ok: false, error: "請輸入項目名稱" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "金額必須為大於 0 的數字" };
  }

  // 先查出這筆是否為 transfer（amount/description 需要同步另一腿）
  const { data: existing, error: fetchError } = await supabase
    .from("transactions")
    .select("type, transfer_group_id")
    .eq("id", input.id)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!existing) return { ok: false, error: "找不到該筆交易" };

  const isTransfer =
    existing.type === "transfer" && Boolean(existing.transfer_group_id);

  // 1) description / amount：transfer 的話兩腿一起更新；否則只動本筆
  const sharedPatch = {
    description: input.description.trim(),
    amount: input.amount,
  };
  if (isTransfer) {
    const { error } = await supabase
      .from("transactions")
      .update(sharedPatch)
      .eq("transfer_group_id", existing.transfer_group_id!);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("transactions")
      .update(sharedPatch)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  }

  // 2) accountId / category：只對非 transfer row 生效，且只更新這一筆
  //    避免改 transfer 帳戶導致兩腿錯位；分類對 transfer 也無意義。
  if (!isTransfer) {
    const rowPatch: Record<string, string> = {};
    if (input.accountId !== undefined) rowPatch.account_id = input.accountId;
    if (input.category !== undefined) rowPatch.category = input.category;
    if (Object.keys(rowPatch).length > 0) {
      const { error } = await supabase
        .from("transactions")
        .update(rowPatch)
        .eq("id", input.id);
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath("/");
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<MutationResult> {
  if (!id) return { ok: false, error: "缺少交易 ID" };

  // 若是 transfer，連同另一腿一起刪
  const { data: existing, error: fetchError } = await supabase
    .from("transactions")
    .select("type, transfer_group_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!existing) return { ok: false, error: "找不到該筆交易" };

  if (existing.type === "transfer" && existing.transfer_group_id) {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("transfer_group_id", existing.transfer_group_id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function createTransaction(
  input: CreateTransactionInput
): Promise<MutationResult> {
  if (!input.userId) return { ok: false, error: "缺少使用者 ID" };
  if (!input.accountId) return { ok: false, error: "請選擇帳戶" };
  if (!input.description.trim()) return { ok: false, error: "請輸入項目名稱" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "金額必須為大於 0 的數字" };
  }
  if (!input.date) return { ok: false, error: "請選擇交易日期" };

  const { error } = await supabase.from("transactions").insert({
    user_id: input.userId,
    account_id: input.accountId,
    description: input.description.trim(),
    amount: input.amount,
    type: input.type,
    priority: input.priority,
    category: input.category ?? "other",
    status: input.status,
    date: input.date,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true };
}

export async function createTransfer(
  input: CreateTransferInput
): Promise<MutationResult> {
  if (!input.userId) return { ok: false, error: "缺少使用者 ID" };
  if (!input.fromAccountId || !input.toAccountId) {
    return { ok: false, error: "請選擇轉出與轉入帳戶" };
  }
  if (input.fromAccountId === input.toAccountId) {
    return { ok: false, error: "轉出與轉入帳戶不能相同" };
  }
  if (!input.description.trim()) return { ok: false, error: "請輸入項目名稱" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "金額必須為大於 0 的數字" };
  }
  if (!input.date) return { ok: false, error: "請選擇交易日期" };

  const groupId = randomUUID();
  const description = input.description.trim();

  const { error } = await supabase.from("transactions").insert([
    {
      user_id: input.userId,
      account_id: input.fromAccountId,
      description,
      amount: input.amount,
      type: "transfer",
      priority: "non_essential",
      category: "other",
      status: input.status,
      date: input.date,
      transfer_group_id: groupId,
      transfer_direction: "out" satisfies TransferDirection,
    },
    {
      user_id: input.userId,
      account_id: input.toAccountId,
      description,
      amount: input.amount,
      type: "transfer",
      priority: "non_essential",
      category: "other",
      status: input.status,
      date: input.date,
      transfer_group_id: groupId,
      transfer_direction: "in" satisfies TransferDirection,
    },
  ]);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true };
}
