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
 * 失敗時回傳全 null 結構，下游應用各自 fallback。
 */
export async function loadSystemSettings(): Promise<ResolvedSettings> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value");
    if (error || !data) {
      return { safetyThreshold: null, budgets: {} };
    }
    return parseSettings(data as SystemSettingRow[]);
  } catch {
    return { safetyThreshold: null, budgets: {} };
  }
}
