"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { runBudgetAlerts } from "@/lib/budget-alerts";
import { createClient } from "@/lib/supabase/server";

import type { ExpenseCategory, IncomeCategory } from "@/lib/dashboard";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/expense-categories";

/** 7 大支出分類 code set — server-side enum validation 用 */
const EXPENSE_CATEGORY_CODES = new Set<string>(
  Object.keys(EXPENSE_CATEGORY_LABEL)
);

export type TransactionType = "income" | "expense" | "transfer";
export type TransactionPriority = "essential" | "non_essential";
export type TransactionStatus = "completed" | "upcoming";
export type TransferDirection = "out" | "in";
export type PaymentMethod = "cash" | "credit_card" | "transfer";

export interface CreateTransactionInput {
  /** Deprecated：後端走 auth.uid()，這個欄位忽略；保留是為了避免改 caller */
  userId?: string;
  accountId: string;
  description: string;
  amount: number;
  type: Exclude<TransactionType, "transfer">;
  priority: TransactionPriority;
  /** 花費大類；未提供時 server 端套用 'other' 預設值，由 DB 預設或這裡顯式填入。 */
  category?: ExpenseCategory;
  /** 付款方式；undefined 不寫 → DB 為 NULL（caller 沒指定就讓欄位空著）。 */
  paymentMethod?: PaymentMethod;
  /** 收入多維度分類（type='income' 才有意義；expense 一律 null） */
  incomeCategory?: IncomeCategory;
  status: TransactionStatus;
  date: string;
}

export interface CreateTransferInput {
  /** Deprecated：後端走 auth.uid() */
  userId?: string;
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
  /** 可選；只允許 income ↔ expense 互改。Transfer row 不接受 type 變更（會破壞配對）。 */
  type?: Exclude<TransactionType, "transfer">;
  /** 週期性 placeholder 編輯時帶 'confirmed' → 把 fulfillment_state 改成
   *  confirmed。不傳的話 state 不動。 */
  fulfillmentState?: "confirmed";
}

export async function updateTransaction(
  input: UpdateTransactionInput
): Promise<MutationResult> {
  if (!input.id) return { ok: false, error: "缺少交易 ID" };
  if (!input.description.trim()) return { ok: false, error: "請輸入項目名稱" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "金額必須為大於 0 的數字" };
  }

  const supabase = await createClient();
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

  // Transfer 不接受 type 變更：要把 transfer 轉成 income/expense 應該走「刪除重建」流程
  if (isTransfer && input.type !== undefined) {
    return {
      ok: false,
      error: "轉帳項目不能直接改成收入/支出，請刪除後重新建立",
    };
  }

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

  // 2) accountId / category / type：只對非 transfer row 生效，且只更新這一筆
  //    避免改 transfer 帳戶導致兩腿錯位；分類對 transfer 也無意義。
  //
  //    type 變更要連動 category：切到 income → category 強制 null（income 沒分類概念）；
  //    切到 expense 但 caller 沒傳 category → 給 'other' 預設，避免 NOT NULL constraint。
  if (!isTransfer) {
    const rowPatch: Record<string, string | null> = {};
    if (input.accountId !== undefined) rowPatch.account_id = input.accountId;

    if (input.type !== undefined) {
      rowPatch.type = input.type;
      if (input.type === "income") {
        rowPatch.category = null; // 強制清掉舊的 expense category
      } else if (input.category === undefined) {
        rowPatch.category = "other"; // expense 但沒傳 → 防止 NOT NULL
      }
    }
    // 顯式傳了 category 就以 caller 為準（除非上面已被 income 蓋成 null）
    if (input.category !== undefined && rowPatch.category === undefined) {
      rowPatch.category = input.category;
    }

    if (Object.keys(rowPatch).length > 0) {
      const { error } = await supabase
        .from("transactions")
        .update(rowPatch)
        .eq("id", input.id);
      if (error) return { ok: false, error: error.message };
    }
  }

  // 3) Recurring placeholder 核銷 — 跟 transfer / 非 transfer 流獨立，
  //    transfer 本身不會是 placeholder（materialize 出來只給 income/expense），
  //    所以 transfer 路徑這條 if 不會命中，安全。
  //
  //    **刻意不打 LINE push**：網頁端核銷是「沉默操作」，視覺焦點留給戰情室
  //    大盤的數字跳動。LINE webhook 收到使用者主動傳訊才回 reply（per
  //    line/webhook/route.ts），這條 server action 不該主動觸發訊息推送。
  if (input.fulfillmentState === "confirmed") {
    const { error } = await supabase
      .from("transactions")
      .update({ fulfillment_state: "confirmed" })
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  }

  // 全站數據聯動：通知中心 / 板塊卡 / 分析頁 / 明細頁 / 淨資產頁 都吃
  // transactions 表，一條交易改動需要打髒所有相關 RSC route 才能即時刷新。
  // revalidatePath('/') 只負責首頁；分析 / 明細 / 淨資產必須各自打髒。
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/transactions");
  revalidatePath("/net-worth");

  // 預算門檻監控 — 跌破 20% / 單日 5× 觸發 LINE Push。
  // 用 await 而非 fire-and-forget — Next.js server action 回應後可能 kill
  // 背景 Promise，導致警報邏輯被中斷。執行時間 < 200ms 影響極微。
  // runBudgetAlerts 內部 try/catch 包死，警報失敗不會炸主流程。
  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    await runBudgetAlerts(supabase, userData.user.id);
  }

  return { ok: true };
}

/**
 * 輕量分類重分類 action — 給 analytics drill-down 面板「現場修正」用。
 *
 * 為什麼不重用 updateTransaction:
 *   updateTransaction 要求 description / amount / type 等一整組欄位驗證，
 *   只想改分類的場景傳那些是浪費 + caller 端要組假資料。獨立 action 更貼
 *   現場修正的單一意圖，也方便加 budget alert 連動。
 *
 * 規則:
 *   - 只接受 7 大 expense 分類 code（前端枚舉外的字串 server 端直接 reject）
 *   - 只動 type='expense' 的交易（transfer / income 沒有 expense category 概念）
 *   - 雙保險：RLS UPDATE policy + .eq('user_id', uid) 顯式 scope
 *   - 重算 runBudgetAlerts — 改分類等於把錢搬到另一個預算桶，可能觸發新警報
 *
 * 連動 revalidatePath: /（首頁 plates）/ /analytics（圓餅 + drill-down）/
 *   /transactions（明細列）/ /net-worth（無影響但便宜，順手打）
 */
export async function updateTransactionCategory(
  transactionId: string,
  newCategory: string
): Promise<MutationResult> {
  if (!transactionId) return { ok: false, error: "缺少交易 ID" };
  if (!EXPENSE_CATEGORY_CODES.has(newCategory)) {
    return { ok: false, error: "分類錯誤" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };
  const uid = userData.user.id;

  // 先確認這筆是 expense — transfer / income 不該透過此 action 改分類
  const { data: existing, error: fetchErr } = await supabase
    .from("transactions")
    .select("type, category")
    .eq("id", transactionId)
    .eq("user_id", uid)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!existing) return { ok: false, error: "找不到該筆交易（或不屬於你）" };
  if (existing.type !== "expense") {
    return { ok: false, error: "只能修改支出交易的分類" };
  }

  // 樂觀短路：分類沒變就不打 DB（節流），但仍回 ok 讓 UI 行為一致
  if (existing.category === newCategory) {
    return { ok: true };
  }

  const { error, count } = await supabase
    .from("transactions")
    .update({ category: newCategory }, { count: "exact" })
    .eq("id", transactionId)
    .eq("user_id", uid);

  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "更新失敗（無命中）" };

  // 預算門檻監控 — 改分類 = 錢從一個預算桶搬到另一個，可能觸發新警報
  await runBudgetAlerts(supabase, uid);

  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/transactions");
  revalidatePath("/net-worth");

  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<MutationResult> {
  if (!id) return { ok: false, error: "缺少交易 ID" };

  const supabase = await createClient();
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
  if (!input.accountId) return { ok: false, error: "請選擇帳戶" };
  if (!input.description.trim()) return { ok: false, error: "請輸入項目名稱" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "金額必須為大於 0 的數字" };
  }
  if (!input.date) return { ok: false, error: "請選擇交易日期" };

  const supabase = await createClient();
  // user_id 走 DB DEFAULT auth.uid()
  // income 沒有「花費分類」概念 → 寫 null；expense 預設 'other'
  const category = input.type === "income" ? null : (input.category ?? "other");
  // income_category 反過來：只有 income 時帶值；expense / transfer 強制 null
  const incomeCategory =
    input.type === "income" ? (input.incomeCategory ?? null) : null;
  // payment_method：caller 沒給就寫 null（DB CHECK 允許 NULL），給了就照寫
  const { error } = await supabase.from("transactions").insert({
    account_id: input.accountId,
    description: input.description.trim(),
    amount: input.amount,
    type: input.type,
    priority: input.priority,
    category,
    income_category: incomeCategory,
    payment_method: input.paymentMethod ?? null,
    status: input.status,
    date: input.date,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/transactions");

  // 預算門檻警報 — 同 updateTransaction 的處理，只在 expense 觸發
  // （income / transfer 都不該打活錢告急、單日熔斷）。
  if (input.type === "expense") {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      await runBudgetAlerts(supabase, userData.user.id);
    }
  }

  return { ok: true };
}

export async function createTransfer(
  input: CreateTransferInput
): Promise<MutationResult> {
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

  const supabase = await createClient();
  const groupId = randomUUID();
  const description = input.description.trim();

  // user_id 兩腿都走 DB DEFAULT auth.uid()
  const { error } = await supabase.from("transactions").insert([
    {
      account_id: input.fromAccountId,
      description,
      amount: input.amount,
      type: "transfer",
      priority: "non_essential",
      category: "other",
      payment_method: "transfer",
      status: input.status,
      date: input.date,
      transfer_group_id: groupId,
      transfer_direction: "out" satisfies TransferDirection,
    },
    {
      account_id: input.toAccountId,
      description,
      amount: input.amount,
      type: "transfer",
      priority: "non_essential",
      category: "other",
      payment_method: "transfer",
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
