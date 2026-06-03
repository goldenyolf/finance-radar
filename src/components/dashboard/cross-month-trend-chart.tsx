"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/dashboard";
import type { CrossMonthTrendPoint } from "@/lib/cross-month-trend";

interface Props {
  data: CrossMonthTrendPoint[];
  /**
   * 使用者設定的每月儲蓄率目標（profiles.target_savings_rate）。
   * 畫成右軸 % 的灰色虛線，提供「我這個月達標了嗎」一眼比對。
   * 可選 — 若沒傳就不畫，相容老 caller。
   */
  targetSavingsRate?: number;
}

function formatCompact(n: number): string {
  if (n === 0) return "";
  return new Intl.NumberFormat("zh-TW", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function formatSigned(n: number): string {
  if (n > 0) return `+${formatCurrency(n)}`;
  if (n < 0) return `−${formatCurrency(Math.abs(n))}`;
  return formatCurrency(0);
}

/**
 * 近 6 個月「收支 + 儲蓄率」複合式圖表（雙 Y 軸）。
 *
 *   - 左 Y：金額（千進制 compact 顯示，避免長標籤擠壓圖區）
 *   - 右 Y：百分比（儲蓄率折線）
 *   - 2 Bar：總收入（emerald）/ 總支出（rose），radius 圓角頂部
 *   - 1 Line：savingsRate，monotone 平滑曲線、藍色 strokeWidth=3 + dot=4
 *
 * 防窺模式：tooltip wrapper + 軸 text 由 globals.css rule 統一 blur，
 * 這支元件零額外工。
 */
export function CrossMonthTrendChart({ data, targetSavingsRate }: Props) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  // theme-aware：暗色用稍亮版本（emerald/red/blue 都需要對比強化）
  const incomeColor = isDark ? "#34d399" : "#10b981"; // emerald-400 / 500
  const expenseColor = isDark ? "#f87171" : "#ef4444"; // red-400 / 500
  const lineColor = isDark ? "#60a5fa" : "#3b82f6"; // blue-400 / 500

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 8, left: -8, bottom: 0 }}
          barGap={2}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatCompact(v as number)}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            width={44}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: lineColor, fontWeight: 500 }}
            width={40}
          />
          <Tooltip
            cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
            content={<CustomTooltip />}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value) => {
              if (value === "totalIncome") return "總收入";
              if (value === "totalExpense") return "總支出";
              if (value === "savingsRate") return "儲蓄率";
              return value;
            }}
          />
          <Bar
            yAxisId="left"
            dataKey="totalIncome"
            fill={incomeColor}
            radius={[4, 4, 0, 0]}
            isAnimationActive
            animationDuration={500}
          />
          <Bar
            yAxisId="left"
            dataKey="totalExpense"
            fill={expenseColor}
            radius={[4, 4, 0, 0]}
            isAnimationActive
            animationDuration={500}
          />
          <Line
            yAxisId="right"
            dataKey="savingsRate"
            type="monotone"
            stroke={lineColor}
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 0, fill: lineColor }}
            activeDot={{ r: 5, strokeWidth: 0 }}
            isAnimationActive
            animationDuration={500}
          />
          {/*
            儲蓄率目標虛線 — 從 profiles.target_savings_rate 來。畫在右軸 (%) 上，
            灰色虛線 strokeDasharray=3 3。使用者一掃就知道「這個月儲蓄率有沒有達標」。
            放在 <Line> 之後確保虛線繪製在 line 上方不被蓋住。
          */}
          {typeof targetSavingsRate === "number" && targetSavingsRate > 0 && (
            <ReferenceLine
              yAxisId="right"
              y={targetSavingsRate}
              stroke="#94a3b8"
              strokeDasharray="3 3"
              label={{
                value: `儲蓄目標 ${targetSavingsRate}%`,
                position: "insideTopLeft",
                fill: "#94a3b8",
                fontSize: 10,
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─────────────────── Custom Tooltip ─────────────────── */

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: CrossMonthTrendPoint }>;
}

/**
 * 深色毛玻璃 tooltip — 列出該月 4 個指標：總收入 / 總支出 / 淨現金流 / 儲蓄率。
 * 整個 tooltip 在防窺模式下會被 .recharts-tooltip-wrapper rule 整塊 blur。
 */
function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const netClass =
    point.netIncome > 0
      ? "text-emerald-400"
      : point.netIncome < 0
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";

  const rateClass =
    point.savingsRate >= 20
      ? "text-emerald-400"
      : point.savingsRate >= 0
        ? "text-amber-600 dark:text-amber-400"
        : "text-rose-600 dark:text-rose-400";

  return (
    <div className="rounded-xl border border-foreground/10 bg-card/95 px-3.5 py-2.5 text-xs shadow-lg backdrop-blur-md ring-1 ring-foreground/5">
      <p className="text-sm font-semibold">{point.month}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums">
        <dt className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full bg-emerald-500 dark:bg-emerald-400"
          />
          總收入
        </dt>
        <dd className="text-right font-medium text-emerald-400">
          {formatCurrency(point.totalIncome)}
        </dd>

        <dt className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full bg-rose-500 dark:bg-rose-400"
          />
          總支出
        </dt>
        <dd className="text-right font-medium text-rose-600 dark:text-rose-400">
          {formatCurrency(point.totalExpense)}
        </dd>

        <dt className="text-muted-foreground">淨現金流</dt>
        <dd className={`text-right font-semibold ${netClass}`}>
          {formatSigned(point.netIncome)}
        </dd>

        <dt className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full bg-blue-500 dark:bg-blue-400"
          />
          儲蓄率
        </dt>
        <dd className={`text-right font-semibold ${rateClass}`}>
          {point.savingsRate.toFixed(1)}%
        </dd>
      </dl>
    </div>
  );
}
