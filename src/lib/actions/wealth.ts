"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type {
  WealthAccountType,
  WealthSnapshotItem,
} from "@/lib/wealth";

export type MutationResult = { ok: true } | { ok: false; error: string };

interface CreateWealthAccountInput {
  name: string;
  type: WealthAccountType;
}

interface UpsertSnapshotInput {
  /** "YYYY-MM-DD" — 通常是今天，但允許補登 */
  recordedAt: string;
  /** account_id → 當下市值；漏填的帳戶會被當成 0 寫入 */
  values: Record<string, number>;
}

/**
 * 新增 wealth_account。user_id 走 DB DEFAULT auth.uid()，這裡不傳；
 * RLS 也用 auth.uid() 驗，多租戶隔離由 DB 把關。
 */
export async function createWealthAccount(
  input: CreateWealthAccountInput
): Promise<MutationResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "請輸入帳戶名稱" };
  if (input.type !== "asset" && input.type !== "liability") {
    return { ok: false, error: "type 必須是 asset 或 liability" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("wealth_accounts").insert({
    name,
    type: input.type,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/net-worth");
  return { ok: true };
}

/**
 * UPSERT 月度快照。同 user_id + 同 recorded_at 已有資料 → 直接覆蓋
 * （前端 Dialog 提交 = 你要的「最新版本」，舊版本沒保留意義）。
 *
 * 不接受 client 算好的 totals — server 端重撈一次 wealth_accounts、
 * 自己拿 values 算 totals + details，避免任何 tampering。
 *
 * net_worth 不傳：DB 端是 GENERATED column，DB 自己 derive。
 */
export async function upsertWealthSnapshot(
  input: UpsertSnapshotInput
): Promise<MutationResult> {
  if (!input.recordedAt) return { ok: false, error: "請選擇快照日期" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.recordedAt)) {
    return { ok: false, error: "日期格式錯誤（需 YYYY-MM-DD）" };
  }

  const supabase = await createClient();

  // 重撈帳戶清單，依當前 RLS scope 看到的為準（不信任 client 的 account_id）
  const { data: accountsData, error: accErr } = await supabase
    .from("wealth_accounts")
    .select("id, name, type");
  if (accErr) return { ok: false, error: accErr.message };
  if (!accountsData || accountsData.length === 0) {
    return { ok: false, error: "請先建立至少一個財富帳戶" };
  }

  let totalAssets = 0;
  let totalLiabilities = 0;
  const details: WealthSnapshotItem[] = [];

  for (const a of accountsData) {
    const accType = a.type as WealthAccountType;
    const raw = input.values[a.id];
    const v = Number.isFinite(raw) && (raw as number) >= 0 ? Number(raw) : 0;
    details.push({
      account_id: a.id,
      name: a.name,
      type: accType,
      value: v,
    });
    if (accType === "asset") totalAssets += v;
    else totalLiabilities += v;
  }

  const { error } = await supabase.from("wealth_snapshots").upsert(
    {
      recorded_at: input.recordedAt,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      details,
    },
    { onConflict: "user_id,recorded_at" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/net-worth");
  return { ok: true };
}

/* ─────────────────── Update / Delete ─────────────────── */

interface UpdateWealthAccountInput {
  id: string;
  name: string;
  type: WealthAccountType;
  /**
   * 若提供 → 同步寫進**今日** snapshot 該帳戶的 value（保留其他帳戶值）。
   * undefined = 只改 name/type 不動 snapshot；省去 user「我只是改名」時意外
   * 多生一筆 snapshot 的副作用。
   */
  todayValue?: number;
}

/**
 * 更新 wealth_account name/type，並可選擇同步更新今日 snapshot 該帳戶的 value。
 *
 * 設計重點:
 *   1) name/type 更新走 UPDATE — RLS WITH CHECK + 顯式 .eq user_id 雙保險
 *   2) value 更新走「snapshot upsert pattern」— 仿 upsertWealthSnapshot：
 *      - 重撈 wealth_accounts 拿 current 帳戶清單 (server-side ground truth)
 *      - 重撈 latest snapshot 拿其他帳戶的最後已知值（保留連續性）
 *      - 替換本次編輯帳戶的 value，其他帳戶用 latest 值（或 0 若全新）
 *      - UPSERT today snapshot (per 0004 user_id+recorded_at unique)
 *   3) 兩步驟順序：先 UPDATE account（name 拼新 snapshot 的 details 用得到）
 *      然後 build snapshot
 *   4) revalidatePath('/net-worth') → 三大數據卡 + 趨勢圖 + 圓餅 + 列表全刷
 */
export async function updateWealthAccount(
  input: UpdateWealthAccountInput
): Promise<MutationResult> {
  if (!input.id) return { ok: false, error: "缺少帳戶 ID" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "請輸入帳戶名稱" };
  if (name.length > 60) return { ok: false, error: "帳戶名稱不可超過 60 字" };
  if (input.type !== "asset" && input.type !== "liability") {
    return { ok: false, error: "type 必須是 asset 或 liability" };
  }
  if (input.todayValue !== undefined) {
    if (!Number.isFinite(input.todayValue) || input.todayValue < 0) {
      return { ok: false, error: "金額必須是 0 或正數" };
    }
    if (input.todayValue > 1_000_000_000_000) {
      return { ok: false, error: "金額超出可儲存範圍（±兆）" };
    }
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };
  const uid = userData.user.id;

  // (1) 更新 name / type
  const { error: updErr, count } = await supabase
    .from("wealth_accounts")
    .update({ name, type: input.type }, { count: "exact" })
    .eq("id", input.id)
    .eq("user_id", uid);

  if (updErr) return { ok: false, error: updErr.message };
  if (!count) return { ok: false, error: "找不到該帳戶（或不屬於你）" };

  // (2) 若未要求改金額 → 結束
  if (input.todayValue === undefined) {
    revalidatePath("/net-worth");
    return { ok: true };
  }

  // (3) Snapshot upsert：拉 current accounts + latest snapshot，重組 details
  const [{ data: accountsData, error: accErr }, { data: latestData, error: latestErr }] =
    await Promise.all([
      supabase
        .from("wealth_accounts")
        .select("id, name, type")
        .eq("user_id", uid),
      supabase
        .from("wealth_snapshots")
        .select("details")
        .eq("user_id", uid)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (accErr) return { ok: false, error: accErr.message };
  if (latestErr) return { ok: false, error: latestErr.message };
  if (!accountsData || accountsData.length === 0) {
    return { ok: false, error: "找不到任何 wealth_account" };
  }

  const prevDetails: WealthSnapshotItem[] =
    (latestData?.details as WealthSnapshotItem[] | null) ?? [];
  const prevValueByAcc = new Map<string, number>();
  for (const d of prevDetails) prevValueByAcc.set(d.account_id, Number(d.value) || 0);

  let totalAssets = 0;
  let totalLiabilities = 0;
  const details: WealthSnapshotItem[] = [];
  for (const a of accountsData) {
    const accType = a.type as WealthAccountType;
    const accId = a.id as string;
    // 編輯的這個 account 用 todayValue；其他承襲 latest snapshot 的值，沒有就 0
    const v =
      accId === input.id ? input.todayValue : prevValueByAcc.get(accId) ?? 0;
    details.push({
      account_id: accId,
      name: a.name as string,
      type: accType,
      value: v,
    });
    if (accType === "asset") totalAssets += v;
    else totalLiabilities += v;
  }

  const today = todayInTaipei();
  const { error: snapErr } = await supabase.from("wealth_snapshots").upsert(
    {
      recorded_at: today,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      details,
    },
    { onConflict: "user_id,recorded_at" }
  );

  if (snapErr) return { ok: false, error: snapErr.message };

  revalidatePath("/net-worth");
  return { ok: true };
}

/**
 * 刪除 wealth_account。
 *
 * 歷史 snapshots 的 details JSONB 不動 — 那是不可變的時點紀錄，刪戶不該回頭
 * 改寫歷史（否則趨勢圖會因為歷史數值改變而失真）。UI 端 dialog 已警告 user
 * 「歷史快照中的數據仍會保留為紀錄，但今後不會再出現」。
 *
 * RLS DELETE policy + 顯式 .eq user_id 雙保險。
 */
export async function deleteWealthAccount(id: string): Promise<MutationResult> {
  if (!id) return { ok: false, error: "缺少帳戶 ID" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "尚未登入" };

  const { error, count } = await supabase
    .from("wealth_accounts")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", userData.user.id);

  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "找不到該帳戶（或不屬於你）" };

  revalidatePath("/net-worth");
  return { ok: true };
}

/** "YYYY-MM-DD" Asia/Taipei — 跟 upsertWealthSnapshot 算法一致 */
function todayInTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
