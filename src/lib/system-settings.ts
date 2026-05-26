/**
 * system_settings 表現在只剩 safety_threshold（其餘 key-value 全清空）。
 *
 * 歷史包袱：Phase 5 之前還有 budget_<category> 這類 row，
 * 改 schema 後改放 categories.budget_monthly 欄位 — 把預算當成 category
 * 自身的屬性，刪 category 時 budget 自動跟著走，也支援使用者自訂分類綁預算。
 *
 * Schema 維持 KV 結構是為了未來再加全域設定（例如 alert_threshold_pct、
 * default_account）時不用 schema migration。
 */

export interface SystemSettingRow {
  key: string;
  value: number | string;
}

export const SETTING_KEY_SAFETY_THRESHOLD = "safety_threshold";

export const DEFAULT_SETTINGS = {
  safetyThreshold: 100000,
};

export interface ResolvedSettings {
  /** 全域現金安全門檻；UI 設定值 > 0 才生效，否則 fallback 到 user 表或 0 */
  safetyThreshold: number | null;
}

/** 把 KV rows 解析成型別 object。Pure function，給 server / client 共用。 */
export function parseSettings(rows: SystemSettingRow[]): ResolvedSettings {
  let safetyThreshold: number | null = null;

  for (const row of rows) {
    const v = typeof row.value === "number" ? row.value : Number(row.value);
    if (!Number.isFinite(v) || v <= 0) continue;

    if (row.key === SETTING_KEY_SAFETY_THRESHOLD) {
      safetyThreshold = v;
    }
  }

  return { safetyThreshold };
}
