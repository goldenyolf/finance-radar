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
