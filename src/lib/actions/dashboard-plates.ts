"use server";

import { revalidatePath } from "next/cache";

import { DASHBOARD_PLATES_MAX } from "@/lib/dashboard-plates";
import { createClient } from "@/lib/supabase/server";

export type MutationResult = { ok: true } | { ok: false; error: string };

export interface CreateDashboardPlateInput {
  name: string;
  description?: string;
  /** accounts.id 陣列；undefined 或 [] = 不綁定 (per 0013 multi-binding) */
  linkedAccountIds?: string[];
}

export interface UpdateDashboardPlateInput {
  id: string;
  name: string;
  description?: string;
  linkedAccountIds?: string[];
}

/**
 * 新增板塊。
 * 上限 4 個 — server 端先 count 擋下，避免 client 競態繞過 UI disabled。
 * user_id 走 DB DEFAULT auth.uid()，RLS 也用 auth.uid() 驗，不傳。
 */
export async function createDashboardPlate(
  input: CreateDashboardPlateInput
): Promise<MutationResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "請輸入板塊名稱" };

  const supabase = await createClient();

  // 上限守衛
  const { count, error: countErr } = await supabase
    .from("dashboard_plates")
    .select("id", { count: "exact", head: true });
  if (countErr) return { ok: false, error: countErr.message };
  if ((count ?? 0) >= DASHBOARD_PLATES_MAX) {
    return {
      ok: false,
      error: `最多只能建立 ${DASHBOARD_PLATES_MAX} 個板塊，請先刪除不用的`,
    };
  }

  // sort_order：擺最後面（COALESCE 處理空表）
  const { data: maxRow } = await supabase
    .from("dashboard_plates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("dashboard_plates").insert({
    name,
    description: input.description?.trim() ?? "",
    linked_account_ids: input.linkedAccountIds ?? [],
    sort_order: nextOrder,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

/**
 * 更新板塊（名稱 / 敘述 / 綁定帳戶）。sort_order 不在這裡動，留給之後的
 * 拖拉排序功能（如果有的話）。
 */
export async function updateDashboardPlate(
  input: UpdateDashboardPlateInput
): Promise<MutationResult> {
  if (!input.id) return { ok: false, error: "缺少板塊 ID" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "請輸入板塊名稱" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("dashboard_plates")
    .update({
      name,
      description: input.description?.trim() ?? "",
      linked_account_ids: input.linkedAccountIds ?? [],
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

/**
 * 刪除板塊。不擋「最後一個」— 使用者可以全砍光走極簡風，UI 那邊會引導重建。
 */
export async function deleteDashboardPlate(
  id: string
): Promise<MutationResult> {
  if (!id) return { ok: false, error: "缺少板塊 ID" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("dashboard_plates")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

/**
 * 拖拉排序持久化 — 接收使用者拖完後的 plateId 陣列，逐筆 UPDATE sort_order。
 *
 * 為什麼不用一條 SQL upsert + array_position：
 *   - PostgREST update with case 寫法複雜且 Supabase JS client 不直接支援
 *   - 板塊上限 4 個，N 條 UPDATE 也才 4 次 round-trip，可接受
 *   - RLS 自動 scope 到 auth.uid()，不會跨租戶
 *
 * 容錯：任一筆失敗就回 error；前端會看到失敗訊息並 router.refresh()
 * 把畫面 sync 回真實的 DB 狀態，不會有半完成的鬼順序。
 */
export async function reorderDashboardPlates(
  orderedIds: string[]
): Promise<MutationResult> {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: "缺少排序陣列" };
  }

  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("dashboard_plates")
      .update({ sort_order: i })
      .eq("id", orderedIds[i]);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * 自訂 emoji 持久化 — 點 Popover 內某個 emoji 即觸發。
 * 空字串 / null → 寫 null 讓 UI 回退 derivePlateEmoji(name) fallback。
 */
export async function updateDashboardPlateEmoji(
  id: string,
  emoji: string | null
): Promise<MutationResult> {
  if (!id) return { ok: false, error: "缺少板塊 ID" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("dashboard_plates")
    .update({ emoji: emoji && emoji.trim() ? emoji.trim() : null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}
