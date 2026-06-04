/**
 * Dashboard 板塊（dashboard_plates）— 取代寫死的 BoardKey enum。
 *
 * 每位使用者最多 4 個板塊（首頁版位有限，超過就太擠）。Phase 1 種子塞
 * 3 個預設（家庭 / 補助 / 個人）。
 *
 * Phase 2 只做 settings 頁的 CRUD UI；首頁 BoardKey 的取代是另一個
 * epic（之後再做）。
 */

export const DASHBOARD_PLATES_MAX = 4;

export interface DashboardPlateRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  /** 綁定的 cash flow accounts.id 陣列；空陣列 = 未綁定 (per 0013 migration) */
  linked_account_ids: string[];
  sort_order: number;
  /** 使用者自訂的 emoji；null = 走 derivePlateEmoji(name) fallback (per 0018) */
  emoji?: string | null;
  created_at?: string;
  updated_at?: string;
}
