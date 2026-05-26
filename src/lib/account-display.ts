/**
 * 帳戶顯示文字字典：強制覆蓋 DB 撈出來的 name 值。
 *
 * 為什麼不用 DB 的 accounts.name？因為 seed 期間 DB 內的 name 欄位可能還
 * 殘留 raw ID（acc-001 之類），讓下拉選單對使用者極不友善。前端用這個
 * map 做最後一道強制覆蓋，DB content drift 不影響 UX。
 *
 * 同時放 acc-joint 與 acc-taishin 兩個 key 指向同一個 label（一個是設計
 * 階段命名、一個是早期 seed 命名），map 兩邊都認避免漏網。
 *
 * 維護：新增帳戶請在這裡補一筆；不在 map 裡的 ID 會 fallback 到 acc.name，
 * 再 fallback 到 acc.id。Fork 後可依自己銀行替換 Bank A/B/C 標籤。
 */
export const ACCOUNT_MAP: Record<string, string> = {
  "acc-001": "個人主帳戶 (Bank A)",
  "acc-post": "補助與投資專戶 (Bank C)",
  "acc-joint": "家庭共同帳戶 (Bank B)",
  "acc-taishin": "家庭共同帳戶 (Bank B)",
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
