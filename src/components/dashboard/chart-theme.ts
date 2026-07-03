/**
 * 圖表 theme-aware 描邊色（Recharts 專用）。
 *
 * 為什麼要這支：Recharts 的 stroke / fill PROP 會被 spread 成 SVG presentation
 * attribute，而瀏覽器不會 evaluate CSS var() 於 presentation attribute。所以
 * 過去 `<CartesianGrid stroke="var(--border)">`、`<Pie stroke="var(--card)">` 的
 * var() 靜默 fallback 成 stroke:none —— 格線與圓餅分隔線在明暗兩色其實都沒 render
 * （同款地雷讓桑基圖的 label 在暗色變黑字，見 cashflow-sankey-chart）。
 *
 * 這裡依 isDark 回傳對齊 design token 的「具體色」，Recharts 拿去當 attribute 也能畫：
 *   - grid    對齊 --border：light oklch(0.922) / dark oklch(1 0 0 / 8%)=白 8%
 *   - surface 對齊 --card  ：light #fff / dark ≈ oklch(0.135)，當圓餅切片分隔線與卡片底融合出間隙
 *
 * dark 的 grid 值與 --border 完全相等，light 亦近似；因此就算某環境下 var() 其實
 * 有解析，換成本函式也不會造成可見色差 —— 是 regression-safe 的替換。
 */
export function chartStroke(isDark: boolean) {
  return {
    grid: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    surface: isDark ? "#141419" : "#ffffff",
  };
}
