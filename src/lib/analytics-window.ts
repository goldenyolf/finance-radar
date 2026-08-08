/**
 * 分析頁的「已載入交易時間窗口」計算 — 純函式，無 React、無 DB。
 *
 * 背景：/analytics 原本呼叫 loadDashboard() 不帶下界 = `select("*")` 全歷史，
 * 而且整份 transactions 會當 prop 序列化進 AnalyticsView（"use client"）→
 * 全部進 RSC payload。使用者累積兩年資料後這是好幾 MB，每次進頁面都重傳。
 *
 * 但不能直接砍窗口：MonthNavigator 往回是無上限的（只擋未來），DailyDetail
 * 的日期 navigator 也是。砍掉等於靜默弄壞歷史瀏覽。
 *
 * 折衷：server 端只給最近 N 個月，使用者真的翻到窗口外時再用 browser
 * supabase client 補抓缺的區間（transactions 有 RLS / 0028，client 端查詢
 * 自動 scope 到本人）。窗口維持成單一連續區間 [earliest, ∞)，補抓時只要
 * 抓 [needed, earliest) 這個 gap，不會重複拿已有的資料。
 */

/** 初始載入窗口：含當月往回 13 個月。夠涵蓋跨月趨勢圖 + 一整年的隨手回看。 */
export const INITIAL_WINDOW_MONTHS = 13;

/**
 * 跨月趨勢圖的窗口長度（getCrossMonthTrendData 寫死 6，含基準月）。
 * 使用者切到月份 M 時，圖表需要 M-5..M —— 所以補抓不能只抓 M 那一個月。
 */
export const TREND_WINDOW_MONTHS = 6;

/** Date → 該月月初的 ISO date "YYYY-MM-01"（用 local time，跟站上其餘月份運算一致）。 */
export function monthStartIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/**
 * "YYYY-MM-01" / "YYYY-MM-DD" → 位移 delta 個月後的月初 ISO。
 * delta 為負 = 往回。用 Date(y, m+delta, 1) 構造，自動處理跨年回捲。
 */
export function shiftMonthIso(iso: string, delta: number): string {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return monthStartIso(new Date(y, m - 1 + delta, 1));
}

/** 站上初始載入窗口的下界（含當月往回 INITIAL_WINDOW_MONTHS - 1 個月）。 */
export function initialWindowSince(now: Date = new Date()): string {
  return shiftMonthIso(monthStartIso(now), -(INITIAL_WINDOW_MONTHS - 1));
}

/**
 * 使用者要看 anchor 這一天 / 這個月時，資料下界最早需要到哪裡。
 *
 * 回傳 anchor 所屬月份往回 TREND_WINDOW_MONTHS - 1 個月的月初 —— 因為
 * AnalyticsMonthlyTab 的趨勢圖是以 monthDate 為基準往回 6 個月移動視窗，
 * 只補抓 anchor 當月的話趨勢圖會少 5 根柱子（而且是靜默少，不會報錯）。
 */
export function requiredSinceFor(anchorIso: string): string {
  return shiftMonthIso(anchorIso.slice(0, 7) + "-01", -(TREND_WINDOW_MONTHS - 1));
}

/**
 * 判斷是否需要往前補抓，以及要補的區間。
 *
 * 回傳 null = 現有窗口已涵蓋，不必打 DB。
 * 回傳 { since, until } = 抓 `date >= since AND date < until` 這個 gap，
 * until 正好是目前的 earliest，所以拿回來的資料跟現有的零重疊。
 */
export function computeBackfillRange(
  anchorIso: string,
  currentEarliest: string
): { since: string; until: string } | null {
  const needed = requiredSinceFor(anchorIso);
  if (needed >= currentEarliest) return null;
  return { since: needed, until: currentEarliest };
}
