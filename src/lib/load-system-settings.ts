import { getCurrentUserId } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  parseSettings,
  type ResolvedSettings,
  type SystemSettingRow,
} from "@/lib/system-settings";

/**
 * 一次撈所有 system_settings rows，整理成型別友善的物件。
 *
 * 抽出來成獨立檔的原因：system-settings.ts 是 client 可用的純型別/常數模組，
 * 但 supabase server client 用了 next/headers 是 server-only。把 loader
 * 分家，避免 client component 透過 system-settings.ts 間接 import 到
 * server-only 程式碼造成 build 失敗。
 *
 * 顯式 .eq("user_id", uid) — system_settings 存的是 per-user 的安全門檻
 * （saveSystemSettings 用 onConflict "user_id,key" 寫入），但這張表在 repo
 * 的 migrations 裡從沒 ENABLE ROW LEVEL SECURITY 過。沒有 filter 的話
 * parseSettings 會拿到全體使用者的 rows，第一筆命中誰的門檻是隨機的。
 *
 * 失敗時回傳全 null 結構，下游應用各自 fallback。
 */
export async function loadSystemSettings(): Promise<ResolvedSettings> {
  try {
    const uid = await getCurrentUserId();
    if (!uid) return { safetyThreshold: null };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value")
      .eq("user_id", uid);
    if (error || !data) {
      return { safetyThreshold: null };
    }
    return parseSettings(data as SystemSettingRow[]);
  } catch {
    return { safetyThreshold: null };
  }
}
