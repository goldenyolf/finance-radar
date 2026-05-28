import { createClient } from "@/lib/supabase/server";

/**
 * Onboarding checklist 的伺服器端可知狀態。
 *
 * 偵測規則：
 *   1. hasPlates   : dashboard_plates 至少 1 筆。新會員 sign-up trigger
 *                    seed 3 條，所以正常情況一律 true，視覺上就是「已勾選」
 *                    的引導項目（教使用者首頁板塊是可自訂的）。
 *   2. hasSnapshot : wealth_snapshots 至少 1 筆 — 真實副作用，拍過才算。
 *
 * Task 2「劃分固定 / 浮動分類」用 LocalStorage 在 client 端標記（使用者
 * 點過 [前往配置] 就算完成），不在這支 server loader 內。
 *
 * 失敗 / 撈不到 → 視為 false（卡片照樣顯示，不會誤把未完成藏起來）。
 */

export interface OnboardingProgress {
  hasPlates: boolean;
  hasSnapshot: boolean;
}

export async function loadOnboardingProgress(): Promise<OnboardingProgress> {
  const supabase = await createClient();

  const [platesRes, snapshotRes] = await Promise.all([
    supabase
      .from("dashboard_plates")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("wealth_snapshots")
      .select("id", { count: "exact", head: true })
      .limit(1),
  ]);

  return {
    hasPlates: (platesRes.count ?? 0) > 0,
    hasSnapshot: (snapshotRes.count ?? 0) > 0,
  };
}
