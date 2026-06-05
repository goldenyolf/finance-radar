"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type CalibrateResult = { ok: true } | { ok: false; error: string };

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

  // 首頁 plates 跟 settings 都需要重抓
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}
