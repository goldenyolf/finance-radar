"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { supabase } from "@/lib/supabase";

export type TransactionType = "income" | "expense" | "transfer";
export type TransactionCategory = "essential" | "non_essential";
export type TransactionStatus = "completed" | "upcoming";
export type TransferDirection = "out" | "in";

export interface CreateTransactionInput {
  userId: string;
  accountId: string;
  description: string;
  amount: number;
  type: Exclude<TransactionType, "transfer">;
  category: TransactionCategory;
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
    category: input.category,
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
      category: "non_essential",
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
      category: "non_essential",
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
