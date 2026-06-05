"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { AccountType } from "@/lib/dashboard";

export type CalibrateResult = { ok: true } | { ok: false; error: string };
export type MutationResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const VALID_TYPES: ReadonlyArray<AccountType> = ["bank", "credit_card", "cash"];

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
}

/**
 * 純粹餘額覆寫 — 不產生任何 transactions row。
 *
 * 為什麼不寫 transaction:
 *   餘額校正是「對齊真實銀行數字」的會計動作（user 進帳冊更新），不是消費
 *   也不是收入。如果硬塞一筆 type='income'/'expense' 的差額 transaction，
 *   會污染：
 *     1) 月度收支圖表（出現一筆假收入/假支出）
 *     2) 儲蓄率計算（差額被算進當月）
 *     3) 預算消耗進度條
 *     4) LINE 訊息推送的「本月已達 X 元」warning
 *   寧可單純 UPDATE balance，保留圖表純淨度。
 *
 * 資安:
 *   - 雙保險 by design:
 *     (a) Supabase RLS (per 0024) — auth.uid() = user_id，DB 層擋跨租戶
 *     (b) Server action 顯式 .eq("user_id", uid) — 程式碼層再擋一次
 *   - revalidatePath 觸發 RSC 重抓，首頁大盤跟 settings 同步刷新
 *
 * 邊界守備:
 *   - newBalance 必為有限數字
 *   - 信用卡帳戶可能負值（欠款），允許 newBalance < 0
 *   - PG NUMERIC(14,2) 上限大約 ±1e12；超出就回錯誤
 */
export async function calibrateAccountBalance(
  accountId: string,
  newBalance: number
): Promise<CalibrateResult> {
  const id = accountId.trim();
  if (!id) return { ok: false, error: "缺少帳戶 ID" };

  if (typeof newBalance !== "number" || !Number.isFinite(newBalance)) {
    return { ok: false, error: "金額格式無效（必須為數字）" };
  }
  if (Math.abs(newBalance) > 1_000_000_000_000) {
    return { ok: false, error: "金額超出可儲存範圍（±兆）" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  const { error, count } = await supabase
    .from("accounts")
    .update({ balance: newBalance }, { count: "exact" })
    .eq("id", id)
    .eq("user_id", userData.user.id);

  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "找不到該帳戶（或不屬於你）" };

  revalidateAll();
  return { ok: true };
}

/* ─────────────────── Create / Update / Delete ─────────────────── */

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  /** 初始餘額；user 不填預設 0 */
  initialBalance: number;
}

/**
 * 新增使用者自訂帳戶。code 一律 NULL（自訂戶不是 pool） — 預設 4 pool
 * 已由 0020 trigger seed，user 透過此入口建的是「額外」帳戶。
 *
 * 雙保險：RLS WITH CHECK auth.uid()=user_id + 顯式寫 user_id。
 * id 走 DB 端 gen_random_uuid()::text 預設（per 0008），不在 client 端產。
 */
export async function createAccount(
  input: CreateAccountInput
): Promise<MutationResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "請輸入帳戶名稱" };
  if (name.length > 60) return { ok: false, error: "帳戶名稱不可超過 60 字" };
  if (!VALID_TYPES.includes(input.type)) {
    return { ok: false, error: "帳戶類型錯誤" };
  }
  if (!Number.isFinite(input.initialBalance)) {
    return { ok: false, error: "初始餘額格式無效" };
  }
  if (Math.abs(input.initialBalance) > 1_000_000_000_000) {
    return { ok: false, error: "金額超出可儲存範圍（±兆）" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userData.user.id,
      name,
      type: input.type,
      balance: input.initialBalance,
      // code 留 null → 自訂帳戶不屬於任何 pool；keywords 預設 '{}' 由 DB default
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true, id: data?.id as string };
}

export interface UpdateAccountInput {
  id: string;
  name: string;
  type: AccountType;
}

/**
 * 更新帳戶 name / type。balance 走 calibrateAccountBalance（純覆寫不污染圖表），
 * code 刻意禁止 update（pool 識別子穩定性 — 跟 categories.code 同款設計）。
 */
export async function updateAccount(
  input: UpdateAccountInput
): Promise<MutationResult> {
  if (!input.id) return { ok: false, error: "缺少帳戶 ID" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "請輸入帳戶名稱" };
  if (name.length > 60) return { ok: false, error: "帳戶名稱不可超過 60 字" };
  if (!VALID_TYPES.includes(input.type)) {
    return { ok: false, error: "帳戶類型錯誤" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  const { error, count } = await supabase
    .from("accounts")
    .update({ name, type: input.type }, { count: "exact" })
    .eq("id", input.id)
    .eq("user_id", userData.user.id);

  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "找不到該帳戶（或不屬於你）" };

  revalidateAll();
  return { ok: true };
}

/**
 * 刪除帳戶 — 影響範圍：
 *   - transactions.account_id → 由 0001 FK ON DELETE SET NULL 自動孤兒化
 *   - categories.default_account_id → 同上 SET NULL (per 0011 FK 設定)
 *   - profiles.default_account_id → 同上 SET NULL
 *   - dashboard_plates.linked_account_ids → array_remove 顯式清掉
 *   - dashboard_plates.linked_account_id (legacy) → SET NULL by FK 已 drop 過
 *
 * caller (UI) 已透過 dialog 警告 user「N 筆交易將失去歸屬」，到這層就執行。
 * 不擋任何情境（即使是 pool 帳戶也允許刪，user 知道自己在幹嘛）。
 */
export async function deleteAccount(
  accountId: string
): Promise<MutationResult> {
  const id = accountId.trim();
  if (!id) return { ok: false, error: "缺少帳戶 ID" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };
  const uid = userData.user.id;

  // 1) plates 陣列裡先把這個 id 拿掉（FK 沒這層保護，是 TEXT[] 自由結構）
  //    用 SQL UPDATE 一次完成 — Supabase JS client 沒 array_remove 包裝，要用 rpc 或裸 SQL。
  //    這裡用 select + 手動 filter + update，多一次 round-trip 但語意明確。
  const { data: plates, error: pErr } = await supabase
    .from("dashboard_plates")
    .select("id, linked_account_ids")
    .eq("user_id", uid);

  if (pErr) return { ok: false, error: pErr.message };

  for (const p of plates ?? []) {
    const arr = (p.linked_account_ids as string[] | null) ?? [];
    if (!arr.includes(id)) continue;
    const cleaned = arr.filter((x) => x !== id);
    const { error: uErr } = await supabase
      .from("dashboard_plates")
      .update({ linked_account_ids: cleaned })
      .eq("id", p.id as string)
      .eq("user_id", uid);
    if (uErr) return { ok: false, error: uErr.message };
  }

  // 2) DELETE the account — FK ON DELETE SET NULL 自動 cascade transactions/categories/profiles
  const { error, count } = await supabase
    .from("accounts")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", uid);

  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "找不到該帳戶（或不屬於你）" };

  revalidateAll();
  return { ok: true };
}

/**
 * UI 用：撈該帳戶當前綁定的 transactions 筆數（給 delete dialog 顯示警告）。
 * 不用 server action 但放這支援不到頁面切換，純粹是 caller 想顯示「N 筆交易將被孤兒化」。
 */
export async function getAccountTransactionCount(
  accountId: string
): Promise<number> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return 0;

  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userData.user.id)
    .eq("account_id", accountId);
  return count ?? 0;
}
