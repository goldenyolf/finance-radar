"use server";

import { revalidatePath } from "next/cache";

import { runBudgetAlerts } from "@/lib/budget-alerts";
import {
  computeDedupKey,
  parseAndClassify,
  type BankFormat,
  type ParsedRow,
} from "@/lib/csv-import";
import { EXPENSE_CATEGORY_CODES } from "@/lib/expense-categories";
import { createClient } from "@/lib/supabase/server";

import type { ExpenseCategory } from "@/lib/expense-categories";

/* ─────────────────── Result types ─────────────────── */

export interface ImportPreview {
  ok: true;
  format: BankFormat;
  rows: ParsedRow[];
  /** 統計面板用：新 / 重複 / 退款 各幾筆 */
  stats: {
    new: number;
    duplicate: number;
    refund: number;
  };
}
export interface ImportError {
  ok: false;
  error: string;
}
export type ImportResult = ImportPreview | ImportError;

export interface ConfirmedRow {
  date: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
}

export type MutationResult =
  | { ok: true; inserted: number }
  | { ok: false; error: string };

/* ─────────────────── parseImportCsv ─────────────────── */

/**
 * 第一階段：收 CSV File → parse → dedup → 回 preview 列表。
 * 不寫進資料庫。使用者在 dialog 確認後才走 confirmImport。
 *
 * 設計：
 *   - 撈當前 user 全部 transactions 的 (date, amount, description) 算 dedup key 集合
 *   - parseAndClassify 比對標記 new / duplicate / refund
 *   - 撈失敗 → existingKeys 空集合，全部視為 new（最差也只是讓 user 重複匯入，可手動刪）
 */
export async function parseImportCsv(formData: FormData): Promise<ImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "缺少 CSV 檔案" };
  }
  if (file.size === 0) {
    return { ok: false, error: "CSV 檔案是空的" };
  }
  // 4 MB 上限 — 信用卡 CSV 通常 < 100 KB；超大檔多半是錯放 zip / xlsx
  if (file.size > 4 * 1024 * 1024) {
    return { ok: false, error: "CSV 檔案過大（上限 4 MB）" };
  }

  let csvText: string;
  try {
    csvText = await file.text();
  } catch {
    return { ok: false, error: "讀取 CSV 內容失敗" };
  }

  // 撈既有 transactions 算 dedup keys
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { ok: false, error: "未登入或 session 失效" };

  const existingKeys = new Set<string>();
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("date, amount, description")
      .eq("user_id", userData.user.id)
      .eq("type", "expense");
    if (!error && data) {
      for (const r of data) {
        const desc = String(r.description ?? "");
        const amt = Number(r.amount) || 0;
        const dt = String(r.date ?? "");
        if (!dt || amt <= 0 || !desc) continue;
        existingKeys.add(computeDedupKey(dt, amt, desc));
      }
    }
  } catch {
    // 失敗 → existingKeys 空集合，全部當 new 處理
  }

  const result = parseAndClassify({ csvText, existingKeys });
  if (result.error) {
    return { ok: false, error: result.error };
  }

  const stats = {
    new: result.rows.filter((r) => r.status === "new").length,
    duplicate: result.rows.filter((r) => r.status === "duplicate").length,
    refund: result.rows.filter((r) => r.status === "refund").length,
  };

  return { ok: true, format: result.format, rows: result.rows, stats };
}

/* ─────────────────── confirmImport ─────────────────── */

/**
 * 第二階段：使用者在 dialog 確認後，把選好的 rows 批次 INSERT 進 transactions。
 *
 * 寫入策略：
 *   - type='expense'：信用卡明細一律支出
 *   - payment_method='credit_card'
 *   - status='completed'：銀行已扣，不是 upcoming
 *   - priority='non_essential'：預設浮動，user 可在明細頁編輯改 essential
 *   - category：每筆走 caller 傳的（user 在 dialog 可下拉改）
 *   - account_id：由 caller 指定（dialog 上方那個帳戶選擇器）
 *
 * 寫入後：
 *   - revalidatePath('/' + '/transactions' + '/analytics')
 *   - 跑 runBudgetAlerts（一次匯入 30 筆可能一口氣跌破 20% 門檻）
 */
export async function confirmImport(
  rows: ConfirmedRow[],
  accountId: string
): Promise<MutationResult> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "沒有可匯入的交易" };
  }
  // 跟 bulkUpdateTransactionCategory 同樣的 500 筆天花板 — rows 直接來自
  // client，沒有上限的話一次 request 可以塞爆整張表。
  if (rows.length > 500) {
    return { ok: false, error: "單次最多匯入 500 筆，請分批處理" };
  }
  if (!accountId) {
    return { ok: false, error: "請選擇匯入目標帳戶" };
  }

  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, error: "未登入或 session 失效" };
  }
  const userId = userData.user.id;

  // 驗 accountId 擁有權 — 舊版直接照寫 client 傳來的值。accounts.id 是全域
  // 唯一的 TEXT，塞別人的 id 過得了 FK，結果是交易掛在使用者看不到的帳戶上
  // 變成幽靈資料（首頁 / 板塊全部依 account_id 過濾）。
  const { data: accRow, error: accErr } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (accErr) return { ok: false, error: accErr.message };
  if (!accRow) return { ok: false, error: "帳戶不存在或不屬於你" };

  // 驗每筆的 category — 跟 updateTransactionCategory / bulkUpdate 同一套雙路徑：
  // built-in 7 code 白名單直接過，其他當 UUID 查 categories 表確認屬於本人。
  // 0031 之後 DB 端沒有 CHECK constraint 了，這層不擋的話任意字串都寫得進去，
  // 之後全部 render 成灰色「其他」。
  const customCategoryIds = new Set(
    rows.map((r) => r.category as string).filter((c) => !EXPENSE_CATEGORY_CODES.has(c))
  );
  if (customCategoryIds.size > 0) {
    const ids = Array.from(customCategoryIds);
    const { data: catRows, error: catErr } = await supabase
      .from("categories")
      .select("id")
      .in("id", ids)
      .eq("user_id", userId)
      .eq("type", "expense");
    if (catErr) return { ok: false, error: catErr.message };
    const owned = new Set((catRows ?? []).map((c) => c.id as string));
    const bad = ids.filter((id) => !owned.has(id));
    if (bad.length > 0) {
      return { ok: false, error: "有交易的分類不存在或不屬於你" };
    }
  }

  const payload = rows.map((r) => ({
    user_id: userId,
    account_id: accountId,
    description: r.description.trim(),
    amount: r.amount,
    type: "expense" as const,
    priority: "non_essential" as const,
    category: r.category,
    payment_method: "credit_card" as const,
    status: "completed" as const,
    date: r.date,
  }));

  const { error } = await supabase.from("transactions").insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/analytics");

  // 一口氣多筆寫入，門檻可能瞬間跌破；跑警報（內部 try/catch 包死不擾主流程）
  await runBudgetAlerts(supabase, userId);

  return { ok: true, inserted: payload.length };
}
