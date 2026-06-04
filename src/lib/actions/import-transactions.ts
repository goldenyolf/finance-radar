"use server";

import { revalidatePath } from "next/cache";

import { runBudgetAlerts } from "@/lib/budget-alerts";
import {
  computeDedupKey,
  parseAndClassify,
  type BankFormat,
  type ParsedRow,
} from "@/lib/csv-import";
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
  const existingKeys = new Set<string>();
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("date, amount, description")
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
  if (!accountId) {
    return { ok: false, error: "請選擇匯入目標帳戶" };
  }

  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, error: "未登入或 session 失效" };
  }
  const userId = userData.user.id;

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
