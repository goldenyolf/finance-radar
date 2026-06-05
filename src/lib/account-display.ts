/**
 * 帳戶顯示文字字典：少數特殊 key 的強制覆蓋。
 *
 * 早期 acc-001 / acc-taishin / acc-post 等 legacy ID 的 hardcoded label
 * 已隨 0023 dedupe migration 移除（legacy 帳戶就地改名為 family_pool 等
 * 池子名稱，DB name 已對齊，不再需要這裡覆蓋）。
 *
 * 唯一保留 `__none__` 給 transactions.account_id IS NULL 的場景顯示。
 *
 * 新帳戶不需要在此補 — 寫得進 DB 的 name 都會自動透過 fallback chain 顯示。
 */
export const ACCOUNT_MAP: Record<string, string> = {
  __none__: "不指定 / 無關聯",
};

/**
 * 帳戶顯示文字 fallback chain：map > DB name > id。
 * 三層保護：若 map 沒命中就用 DB name，DB name 也沒有就回退到 id（至少不會空白）。
 */
export function getAccountLabel(
  id: string | null | undefined,
  fallbackName?: string | null
): string {
  if (!id) return ACCOUNT_MAP.__none__ ?? "不指定 / 無關聯";
  return ACCOUNT_MAP[id] || fallbackName || id;
}
