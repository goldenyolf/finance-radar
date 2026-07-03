"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { runBudgetAlerts } from "@/lib/budget-alerts";
import { stripDescriptionLabel } from "@/lib/description-normalize";
import { createClient } from "@/lib/supabase/server";

import type { IncomeCategory } from "@/lib/dashboard";
import {
  classifyByKeyword,
  EXPENSE_CATEGORY_LABEL,
} from "@/lib/expense-categories";

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
  /** 花費大類；未提供時 server 端套用 'other' 預設值。per 0030：值可能是
   *  built-in code 或 categories.id (UUID)。 */
  category?: string;
  /** 付款方式；undefined 不寫 → DB 為 NULL（caller 沒指定就讓欄位空著）。 */
  paymentMethod?: PaymentMethod;
  /** 收入多維度分類（type='income' 才有意義；expense 一律 null） */
  incomeCategory?: IncomeCategory;
  /**
   * 重大專案標籤（per 0028）— freeform e.g. '太太醫療' / '新居家電'。
   * 空字串 / undefined / null 都視為「日常」不打標籤；server 端統一寫 NULL。
   * 在分析頁的隔離模式 OFF 時，這些有打標籤的交易會被過濾掉、進歸檔區。
   */
  projectTag?: string | null;
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
  /** 重大專案標籤 — 兩腿都寫，保持配對資料一致。 */
  projectTag?: string | null;
}

export type MutationResult = { ok: true } | { ok: false; error: string };

export interface UpdateTransactionInput {
  id: string;
  description: string;
  amount: number;
  /** 可選；變更才傳。Transfer 改帳戶會破壞配對，這欄位對 transfer 不生效。 */
  accountId?: string;
  /** 可選；變更才傳。Transfer 沒有花費分類概念，這欄位對 transfer 不生效。
   *  per 0030：值可能是 built-in code 或 categories.id (UUID)；server 不再窄化 enum。 */
  category?: string;
  /** 可選；只允許 income ↔ expense 互改。Transfer row 不接受 type 變更（會破壞配對）。 */
  type?: Exclude<TransactionType, "transfer">;
  /** 週期性 placeholder 編輯時帶 'confirmed' → 把 fulfillment_state 改成
   *  confirmed。不傳的話 state 不動。 */
  fulfillmentState?: "confirmed";
  /**
   * 重大專案標籤（per 0028）— freeform 字串或顯式 null 解綁。
   *   - undefined: 不動原值
   *   - "" / null: 寫成 NULL（使用者刪光輸入框 = 解綁）
   *   - 非空字串: trim 後寫入
   * Transfer rows 兩腿一起更新，保持配對資料一致。
   */
  projectTag?: string | null;
}

/** 把 caller 傳來的 projectTag 標準化成 DB 想要的格式：null 或 trimmed 非空字串。 */
function normalizeProjectTag(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
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

  // per review #7：明確拿當前 user id，belt+suspenders 對齊 bulkUpdate /
  // updateTransactionCategory 的寫法。RLS 是主防線但不假設它永遠在（未來
  // migration 手滑或 dev SECURITY DEFINER 引入的爬升路徑都可能繞開）。
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };
  const uid = userData.user.id;

  // 先查出這筆是否為 transfer（amount/description 需要同步另一腿）— fetch 也 scope 到當前 user
  const { data: existing, error: fetchError } = await supabase
    .from("transactions")
    .select("type, transfer_group_id")
    .eq("id", input.id)
    .eq("user_id", uid)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!existing) return { ok: false, error: "找不到該筆交易（或不屬於你）" };

  const isTransfer =
    existing.type === "transfer" && Boolean(existing.transfer_group_id);

  // Transfer 不接受 type 變更：要把 transfer 轉成 income/expense 應該走「刪除重建」流程
  if (isTransfer && input.type !== undefined) {
    return {
      ok: false,
      error: "轉帳項目不能直接改成收入/支出，請刪除後重新建立",
    };
  }

  // 1) description / amount / project_tag：transfer 的話兩腿一起更新；否則只動本筆。
  //    project_tag 對兩腿 sync 是刻意的 — 一筆「新居家電」轉帳被標籤後，配對的
  //    另一腿也屬於同一專案，分析頁過濾時兩腿才會同進同出。
  //    per review #1：edit 路徑不再自動 stripDescriptionLabel —— user 已在
  //    dialog 內看到當前標題，任何刻意打的「支付：X」是用戶意圖，不該被
  //    server 靜默改寫。create 路徑（createTransaction / createTransfer /
  //    LINE webhook）仍會剝，因為那邊是「新鮮」文字。
  const sharedPatch: Record<string, string | number | null> = {
    description: input.description.trim(),
    amount: input.amount,
  };
  if (input.projectTag !== undefined) {
    sharedPatch.project_tag = normalizeProjectTag(input.projectTag);
  }
  if (isTransfer) {
    const { error } = await supabase
      .from("transactions")
      .update(sharedPatch)
      .eq("transfer_group_id", existing.transfer_group_id!)
      .eq("user_id", uid);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("transactions")
      .update(sharedPatch)
      .eq("id", input.id)
      .eq("user_id", uid);
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
        .eq("id", input.id)
        .eq("user_id", uid);
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
      .eq("id", input.id)
      .eq("user_id", uid);
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
  await runBudgetAlerts(supabase, uid);

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
  if (!newCategory) return { ok: false, error: "分類錯誤" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };
  const uid = userData.user.id;

  /*
    per 0030：newCategory 可能是 built-in code 或 categories.id (UUID)。
      - built-in code → 白名單認 7 個 code 就直接通過
      - 其他字串 → 視為 UUID，去 categories 表確認這個 id 屬於當前使用者
        （防跨租戶污染 / 亂發 UUID）
    RLS 已擋，但 belt+suspenders 顯式擋一層錯誤訊息更好懂。
  */
  if (!EXPENSE_CATEGORY_CODES.has(newCategory)) {
    const { data: catRow, error: catErr } = await supabase
      .from("categories")
      .select("id, type")
      .eq("id", newCategory)
      .eq("user_id", uid)
      .maybeSingle();
    if (catErr) return { ok: false, error: catErr.message };
    if (!catRow) return { ok: false, error: "分類不存在或不屬於你" };
    if (catRow.type !== "expense") {
      return { ok: false, error: "只能選 expense 類型的分類" };
    }
  }

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

export interface BulkUpdateProjectTagInput {
  transactionIds: string[];
  /**
   * 批次套用的專案標籤：
   *   - 非空字串：trim 後 set
   *   - "" / null：清除標籤回日常
   */
  projectTag: string | null;
}

export type BulkMutationResult =
  | { ok: true; updatedCount: number; skippedCount: number }
  | { ok: false; error: string };

/**
 * 批次更新 N 筆 transactions 的 project_tag — 給歷史明細頁的「多選 + 懸浮工具列」用。
 *
 * 資安防線雙保險:
 *   1) RLS UPDATE policy（0028 已建）— DB 端 row-level 過濾，這是主要 fence
 *   2) `.eq("user_id", uid)` 顯式 scope — RLS 萬一被誤關（dev / 未來 migration
 *      手滑），程式碼層仍擋住跨租戶污染。per memory:
 *      [supabase_multi_tenant_update_scope]
 *
 * per review #8: transfer 配對展開 —
 *   之前 spec 是「trust selection literally」，但這跟 updateTransaction 的
 *   sync-both-legs 語意不一致。使用者常見 case：只勾其中一腿沒發現另一腿也
 *   要跟著標。改成先查 selectedIds 內是 transfer 的 rows，抓出 transfer_group_id，
 *   再把配對的另一腿一併納入更新集合。
 *
 * per review #9: partial-success telemetry —
 *   updatedCount 可能 < requestedCount（某些 id race 已被刪、跨租戶 RLS 過濾）；
 *   回傳 skippedCount 讓 UI 告訴使用者「已標 N 筆（M 筆被略過）」，別再假裝
 *   全部成功。
 *
 * 上限 500 筆:
 *   PostgREST query string ~8KB；UUID 36 chars × 500 ≈ 18KB。攔在 500 是為了
 *   給清楚錯誤訊息，比讓底層偷偷拆好 debug。
 */
export async function bulkUpdateTransactionProject(
  input: BulkUpdateProjectTagInput
): Promise<BulkMutationResult> {
  const requestedCount = input.transactionIds.length;
  if (requestedCount === 0) {
    return { ok: false, error: "未選擇任何交易" };
  }
  if (requestedCount > 500) {
    return { ok: false, error: "單次最多 500 筆，請分批處理" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };
  const uid = userData.user.id;

  const projectTag = normalizeProjectTag(input.projectTag);

  /*
    per review #8：expand transfer pairs.
    先查 selectedIds 內是 transfer 的 rows；把它們的 transfer_group_id 撈起來，
    展開到「id IN (selected) OR transfer_group_id IN (groups)」的並集。
    這樣一定跟 updateTransaction 的兩腿 sync 行為一致。
    RLS + user_id filter 都上，跨租戶不會被展開撈到別家的 rows。
  */
  const { data: transferRows, error: transferErr } = await supabase
    .from("transactions")
    .select("id, transfer_group_id")
    .in("id", input.transactionIds)
    .eq("user_id", uid)
    .eq("type", "transfer");
  if (transferErr) return { ok: false, error: transferErr.message };

  const transferGroupIds = Array.from(
    new Set(
      (transferRows ?? [])
        .map((r) => r.transfer_group_id as string | null)
        .filter((g): g is string => !!g)
    )
  );

  // 執行 update — 分兩個 statement 求穩，比 or 拼字串好 debug；用 Set 合併結果 count
  const updatedIds = new Set<string>();

  {
    const { data, error } = await supabase
      .from("transactions")
      .update({ project_tag: projectTag })
      .in("id", input.transactionIds)
      .eq("user_id", uid)
      .select("id");
    if (error) return { ok: false, error: error.message };
    for (const r of data ?? []) updatedIds.add(r.id as string);
  }

  if (transferGroupIds.length > 0) {
    const { data, error } = await supabase
      .from("transactions")
      .update({ project_tag: projectTag })
      .in("transfer_group_id", transferGroupIds)
      .eq("user_id", uid)
      .select("id");
    if (error) return { ok: false, error: error.message };
    for (const r of data ?? []) updatedIds.add(r.id as string);
  }

  const updatedCount = updatedIds.size;
  if (updatedCount === 0) {
    return { ok: false, error: "更新失敗（無命中或不屬於你）" };
  }

  /*
    per review #9：skippedCount 是「使用者選了但沒真的被標到」的數量。
    展開 transfer 配對之後，updatedCount 可能 > requestedCount（多帶了另一腿），
    這時 skippedCount = 0；也可能 < requestedCount（某些 id 已被刪 / RLS 過濾）。
    只在使用者選的 ID 沒真的被 update 到時才算 skipped。
  */
  const missedFromRequest = input.transactionIds.filter(
    (id) => !updatedIds.has(id)
  ).length;
  const skippedCount = missedFromRequest;

  // 全站數據聯動：板塊卡 / 分析頁 / 明細頁都吃 transactions，全部打髒
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/transactions");

  return { ok: true, updatedCount, skippedCount };
}


/* ─────────────────────── Bulk category update ─────────────────────── */

export interface BulkUpdateCategoryInput {
  transactionIds: string[];
  /** built-in code ('food_dining' 等) 或 categories.id (UUID, 自訂)。per 0030。 */
  category: string;
}

/**
 * 批次更新 N 筆 expense transactions 的 category — 給歷史明細頁的多選工具列
 * 「批次更改分類」入口用。
 *
 * 設計:
 *   a) 雙路徑驗證（跟 updateTransactionCategory 一致）：
 *        - built-in 7 code 白名單直接通過
 *        - 其他字串當 UUID，查 categories 表確認屬於當前 user + type=expense
 *          （防跨租戶亂發別家 UUID）
 *   b) type=expense 過濾：category 對 income / transfer 沒意義；更新時直接
 *      加 `.eq("type", "expense")`，income/transfer row 靜默略過。skippedCount
 *      會反映被略過的筆數，toast 明講「M 筆被略過」。
 *   c) 不展開 transfer 配對（跟 project_tag 相反）：transfer 沒 category 語意，
 *      不該波及配對另一腿。
 *   d) runBudgetAlerts — 分類改動 = 錢從一個預算桶搬到另一個，可能觸發新警報。
 *   e) `.eq("user_id", uid)` belt+suspenders，per memory
 *      [supabase_multi_tenant_update_scope]。
 */
export async function bulkUpdateTransactionCategory(
  input: BulkUpdateCategoryInput
): Promise<BulkMutationResult> {
  const requestedCount = input.transactionIds.length;
  if (requestedCount === 0) {
    return { ok: false, error: "未選擇任何交易" };
  }
  if (requestedCount > 500) {
    return { ok: false, error: "單次最多 500 筆，請分批處理" };
  }
  if (!input.category) return { ok: false, error: "分類錯誤" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };
  const uid = userData.user.id;

  // (a) 分類驗證 — built-in 7 直接通過；其他 → 當 UUID 查 categories 表
  if (!EXPENSE_CATEGORY_CODES.has(input.category)) {
    const { data: catRow, error: catErr } = await supabase
      .from("categories")
      .select("id, type")
      .eq("id", input.category)
      .eq("user_id", uid)
      .maybeSingle();
    if (catErr) return { ok: false, error: catErr.message };
    if (!catRow) return { ok: false, error: "分類不存在或不屬於你" };
    if (catRow.type !== "expense") {
      return { ok: false, error: "只能選 expense 類型的分類" };
    }
  }

  // (b) 執行 update — 只動 type=expense 的 row；transfer / income 靜默過濾
  const { data, error } = await supabase
    .from("transactions")
    .update({ category: input.category })
    .in("id", input.transactionIds)
    .eq("user_id", uid)
    .eq("type", "expense")
    .select("id");
  if (error) return { ok: false, error: error.message };

  const updatedIds = new Set<string>((data ?? []).map((r) => r.id as string));
  const updatedCount = updatedIds.size;
  if (updatedCount === 0) {
    return {
      ok: false,
      error: "更新失敗（沒有支出交易被更新，可能全選到轉帳 / 收入或已被刪除）",
    };
  }
  const skippedCount = input.transactionIds.filter(
    (id) => !updatedIds.has(id)
  ).length;

  // (c) 分類改動 → 重算預算門檻警報（錢搬預算桶）
  await runBudgetAlerts(supabase, uid);

  // (d) 全站聯動
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/transactions");

  return { ok: true, updatedCount, skippedCount };
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
  // income 沒有「花費分類」概念 → 寫 null
  // expense: caller 有傳 category 就用；沒傳 → 走 classifyByKeyword 做關鍵字
  // 反查（e.g.「早餐 60」→ food_dining），跟 LINE bot 端 fallback 對齊
  // (per Ken persona review round 1 · K-A3.1)。沒命中才落 'other'。
  const category =
    input.type === "income"
      ? null
      : input.category ?? classifyByKeyword(input.description);
  // income_category 反過來：只有 income 時帶值；expense / transfer 強制 null
  const incomeCategory =
    input.type === "income" ? (input.incomeCategory ?? null) : null;
  // payment_method：caller 沒給就寫 null（DB CHECK 允許 NULL），給了就照寫
  const { error } = await supabase.from("transactions").insert({
    account_id: input.accountId,
    description: stripDescriptionLabel(input.description),
    amount: input.amount,
    type: input.type,
    priority: input.priority,
    category,
    income_category: incomeCategory,
    payment_method: input.paymentMethod ?? null,
    status: input.status,
    date: input.date,
    project_tag: normalizeProjectTag(input.projectTag ?? null),
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
  const description = stripDescriptionLabel(input.description);
  const projectTag = normalizeProjectTag(input.projectTag ?? null);

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
      project_tag: projectTag,
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
      project_tag: projectTag,
    },
  ]);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true };
}
