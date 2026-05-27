"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/dashboard";
import type { DailySpendData, DailySpendPoint } from "@/lib/daily-spend";

interface Props {
  data: DailySpendData;
  /** "2026-05-26" — 高亮對應柱子；null = 沒有任何選中 */
  selectedDate: string | null;
  /** 使用者點某天 → 把該日 isoDate 拋上去 */
  onDateSelect: (isoDate: string) => void;
}

function formatCompact(n: number): string {
  if (n === 0) return "";
  return new Intl.NumberFormat("zh-TW", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/**
 * 每日花費透視 — Stacked Bar Chart。
 *
 * 行為：
 *   - 動態從 data.series 生 <Bar>，stackId="day" → 同日多分類疊起來
 *   - 點任一柱（含 0 高度的空白日）→ onDateSelect(isoDate)
 *   - selectedDate 對應柱子用更深的 stroke 高亮，視覺上「我正在看這天」
 *   - Mobile 容器 overflow-x-auto + min-width 640px，配 hint badge + 右側
 *     漸層 fade（跟 CashflowSankeyChart 同款 UX，使用者已熟悉）
 *
 * Recharts onClick：BarChart 層級的 onClick 會收到 { activeLabel,
 * activePayload }；activePayload[0].payload 就是該 column 對應的 DailySpendPoint。
 * 不在個別 <Bar> 上 onClick — 那樣只有點到色塊才觸發、點到柱子之間空白就失效。
 */
export function DailySpendChart({ data, selectedDate, onDateSelect }: Props) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const { points, series } = data;

  if (series.length === 0) {
    return (
      <div className="grid h-72 w-full place-items-center rounded-lg border border-dashed border-foreground/10 bg-muted/30 text-center text-xs text-muted-foreground">
        本月還沒有任何已完成的花費紀錄
      </div>
    );
  }

  // Recharts onClick 的 payload 結構 — 抓出當下被點的那一筆 DailySpendPoint
  function handleChartClick(state: unknown) {
    if (!state || typeof state !== "object") return;
    const s = state as {
      activePayload?: Array<{ payload?: DailySpendPoint }>;
    };
    const point = s.activePayload?.[0]?.payload;
    if (point?.isoDate) onDateSelect(point.isoDate);
  }

  return (
    <ScrollableChart>
      <div className="min-w-[640px] md:min-w-0">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={points}
              margin={{ top: 12, right: 12, left: -8, bottom: 0 }}
              onClick={handleChartClick}
              barCategoryGap={4}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tickFormatter={(v) => formatCompact(v as number)}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                width={48}
              />
              <Tooltip
                cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "var(--card-foreground)",
                  padding: "8px 12px",
                }}
                labelFormatter={(label, items) => {
                  const point = items?.[0]?.payload as
                    | DailySpendPoint
                    | undefined;
                  if (!point) return String(label);
                  return `${point.isoDate}（合計 ${formatCurrency(point.total)}）`;
                }}
                formatter={(value, name) => {
                  const n = typeof value === "number" ? value : Number(value) || 0;
                  return [formatCurrency(n), String(name)];
                }}
              />
              {series.map((s) => (
                <Bar
                  key={s.name}
                  dataKey={s.name}
                  stackId="day"
                  fill={s.color}
                  /* selected 柱用較粗的 stroke 標記；非 selected 走預設無框 */
                  stroke={isDark ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.85)"}
                  /* 條件 stroke-width 透過 shape callback 不好做；改在外層 wrapper
                     加 selected 視覺 — 這裡每個 stack 用同樣 stroke，但 strokeWidth
                     用 dataKey 判斷。Recharts 不支援 per-cell stroke，所以走 isAnimationActive=false
                     + cursor pointer 引導點擊。 */
                  strokeWidth={0}
                  cursor="pointer"
                  isAnimationActive={false}
                  radius={
                    /* 只給最頂層那段加圓角 — series 是 monthTotal DESC 排序，
                       底層先 render 故最後一個 series 是視覺最上層 */
                    s === series[series.length - 1] ? [3, 3, 0, 0] : undefined
                  }
                />
              ))}
              {/* selected 日的提示：用一個透明 overlay bar 標記 — Recharts 沒原生「高亮某 column」API */}
              {selectedDate && (
                <Bar
                  dataKey={(point: DailySpendPoint) =>
                    point.isoDate === selectedDate ? point.total : 0
                  }
                  fill="transparent"
                  stroke={isDark ? "#fff" : "#000"}
                  strokeWidth={1.5}
                  stackId="overlay"
                  isAnimationActive={false}
                  cursor="pointer"
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ScrollableChart>
  );
}

/* ─────────────────── Mobile scroll wrapper（與 Sankey 同款 UX） ─────────────────── */

/**
 * 行動版橫向 scroll 容器：hint badge（滑過自動消失）+ 右側漸層 fade（到底自動消失）。
 * 跟 CashflowSankeyChart 的 ScrollableSankey 是同款手法 — 之後若要 DRY 可以
 * 抽到 components/ui/scrollable-chart.tsx，目前兩個 caller 先各自 inline。
 */
function ScrollableChart({ children }: { children: React.ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      if (el.scrollLeft > 4) setHasScrolled(true);
      setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="relative">
      {!hasScrolled && (
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 md:hidden">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/85 px-3 py-1 text-[11px] font-medium text-background shadow-sm backdrop-blur-sm">
            <ArrowLeftRight className="size-3" />
            左右滑動瀏覽整月
          </span>
        </div>
      )}

      <div
        ref={scrollerRef}
        className="-mx-2 overflow-x-auto overscroll-x-contain px-2 [scrollbar-width:thin] md:mx-0 md:overflow-x-visible md:px-0"
      >
        {children}
      </div>

      <div
        aria-hidden
        className={`pointer-events-none absolute top-0 right-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent transition-opacity duration-200 md:hidden ${
          atEnd ? "opacity-0" : "opacity-100"
        }`}
      />
    </div>
  );
}
