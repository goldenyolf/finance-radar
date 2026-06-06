import { createClient } from "@/lib/supabase/server";
import type {
  WealthAccountRow,
  WealthSnapshotRow,
} from "@/lib/wealth";

/**
 * 撈當前登入會員的 wealth_accounts + wealth_snapshots。
 * RLS policy 自動 scope，不用顯式 where user_id。
 *
 * 失敗回空陣列；/net-worth 不該因為這兩張表撈失敗就 500。
 *
 * 抽出來成獨立檔避免 client component 透過 wealth.ts 間接 import
 * 到 server-only 的 next/headers（cookies）。
 */

export interface WealthSnapshot {
  accounts: WealthAccountRow[];
  snapshots: WealthSnapshotRow[];
}

export async function loadWealth(): Promise<WealthSnapshot> {
  try {
    const supabase = await createClient();

    const [accountsRes, snapshotsRes] = await Promise.all([
      supabase
        .from("wealth_accounts")
        .select("*")
        // 軟刪除過濾 (per 0027) — 大盤 / 圓餅 / 列表只看 active；
        // 歷史快照詳情仍透過 wealth_snapshots.details JSONB 保留 archived 紀錄
        .eq("status", "active")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      // DESC：UI 拿 [0] 就是最新；趨勢圖在 client 端轉 ASC 再餵 Recharts
      supabase
        .from("wealth_snapshots")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(24), // 最多兩年；超過用月度 down-sample 是之後的事
    ]);

    return {
      accounts: (accountsRes.data ?? []) as WealthAccountRow[],
      snapshots: (snapshotsRes.data ?? []) as WealthSnapshotRow[],
    };
  } catch {
    return { accounts: [], snapshots: [] };
  }
}
