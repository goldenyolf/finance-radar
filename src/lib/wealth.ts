/**
 * 淨資產 / 財富管理模組（低頻月度快照）
 *
 *   wealth_accounts    ：使用者自訂的「財富帳戶」buckets
 *                        — 只記元資料（名稱 / 類型 / 排序），不存當下市值。
 *   wealth_snapshots   ：月度資產快照
 *                        — 每筆 = 那個時點的 total_assets / total_liabilities
 *                           + 各 wealth_account 的 value 陣列（details JSONB）。
 *                        net_worth 是 DB 端 GENERATED column，永遠 =
 *                        total_assets − total_liabilities，前端不用算。
 *
 * 跟 transactions / accounts 刻意分開：這是「存量」概念，不是「流量」。
 * 月底拍一張照即可，不該污染現金流預測。
 */

export type WealthAccountType = "asset" | "liability";

export interface WealthAccountRow {
  id: string;
  user_id: string;
  name: string;
  type: WealthAccountType;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

/** wealth_snapshots.details 陣列裡的單筆 item — DB 端是 JSONB array */
export interface WealthSnapshotItem {
  account_id: string;
  name: string;
  type: WealthAccountType;
  /** 該時點該帳戶的市值（負債就是當下未還餘額） */
  value: number;
}

export interface WealthSnapshotRow {
  id: string;
  user_id: string;
  /** ISO date "YYYY-MM-DD" — Taipei 時區 */
  recorded_at: string;
  total_assets: number | string;
  total_liabilities: number | string;
  net_worth: number | string;
  details: WealthSnapshotItem[];
  created_at?: string;
}

export const numW = (v: number | string | null | undefined): number =>
  typeof v === "number" ? v : Number.parseFloat(v ?? "0") || 0;

/**
 * 撈最新一筆快照 — snapshots 預設 DESC by recorded_at，所以拿 [0]。
 * 沒任何快照回 null（empty state）。
 */
export function latestSnapshot(
  snapshots: WealthSnapshotRow[]
): WealthSnapshotRow | null {
  return snapshots[0] ?? null;
}

/**
 * 把 wealth_accounts 跟最新快照的 details 對齊，輸出 UI 顯示用的清單。
 * 沒對到的帳戶顯示 value=null（UI 顯示「尚未拍攝」），避免騙人說餘額是 0。
 */
export interface DisplayAccount {
  id: string;
  name: string;
  type: WealthAccountType;
  /** null = 該帳戶在最新快照中沒值（新建尚未拍照）；UI 顯示「—」 */
  value: number | null;
}

export function buildDisplayAccounts(
  accounts: WealthAccountRow[],
  latest: WealthSnapshotRow | null
): DisplayAccount[] {
  const valueMap = new Map<string, number>();
  if (latest) {
    for (const item of latest.details) {
      valueMap.set(item.account_id, numW(item.value));
    }
  }
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    value: valueMap.has(a.id) ? (valueMap.get(a.id) as number) : null,
  }));
}

/** 趨勢圖點 — recorded_at 轉成「2026/05」可讀標籤 */
export interface NetWorthPoint {
  label: string;
  /** ISO 原始日期，tooltip / scrollbar 用 */
  recorded_at: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
}

export function snapshotsToTrendPoints(
  snapshots: WealthSnapshotRow[]
): NetWorthPoint[] {
  // 接到的可能是 DESC（最新在前），趨勢圖要 ASC（左→右 = 過去→現在）
  const sorted = [...snapshots].sort((a, b) =>
    a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? 1 : 0
  );
  return sorted.map((s) => ({
    label: formatMonthLabel(s.recorded_at),
    recorded_at: s.recorded_at,
    total_assets: numW(s.total_assets),
    total_liabilities: numW(s.total_liabilities),
    net_worth: numW(s.net_worth),
  }));
}

function formatMonthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  if (!y || !m) return iso;
  return `${y}/${m}`;
}

/**
 * 拍快照前的 sanity：給定 (accounts, valuesMap) 算出 totals。
 * Dialog 預覽 + server action upsert 都用這支，前後台一致。
 */
export interface SnapshotTotals {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  details: WealthSnapshotItem[];
}

export function computeSnapshotTotals(
  accounts: WealthAccountRow[],
  values: Record<string, number>
): SnapshotTotals {
  let totalAssets = 0;
  let totalLiabilities = 0;
  const details: WealthSnapshotItem[] = [];

  for (const a of accounts) {
    const raw = values[a.id];
    const v = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    details.push({
      account_id: a.id,
      name: a.name,
      type: a.type,
      value: v,
    });
    if (a.type === "asset") totalAssets += v;
    else totalLiabilities += v;
  }

  return {
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    net_worth: totalAssets - totalLiabilities,
    details,
  };
}

export function formatTwd(n: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}
