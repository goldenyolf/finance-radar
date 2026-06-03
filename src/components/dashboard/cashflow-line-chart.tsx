"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartEmptyState } from "@/components/dashboard/chart-empty-state";

export type CashflowPoint = {
  /** 顯示用標籤，例如 "5月" 或 "Wk 21" */
  label: string;
  /** 預測該時點的可用現金（含未來支出抵減） */
  cash: number;
};

type Props = {
  data?: CashflowPoint[];
  /** 安全準備金門檻（紅色基準線） */
  threshold?: number;
};

function formatTwd(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatCompact(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function CashflowLineChart({ data, threshold = 150000 }: Props) {
  if (!data || data.length === 0) {
    return (
      <ChartEmptyState
        variant="area"
        message="📊 還沒足夠的記帳資料畫現金流預測 — 累積幾筆收支後這裡會自動展開趨勢！"
      />
    );
  }
  const points = data;

  // theme-aware 配色：dark 走霓虹藍 + 亮紅，light 維持 indigo + 標準紅
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const lineColor = isDark ? "#60a5fa" : "#6366f1"; // blue-400 vs indigo-500
  const thresholdColor = isDark ? "#f87171" : "#ef4444"; // red-400 vs red-500
  const gradientOpacity = isDark ? 0.45 : 0.35;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
        >
          <defs>
            <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={gradientOpacity} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickFormatter={(v) => formatCompact(v as number)}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            width={56}
          />
          <Tooltip
            cursor={{
              stroke: "var(--border)",
              strokeDasharray: "3 3",
            }}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--card-foreground)",
            }}
            formatter={(value) => {
              const n = typeof value === "number" ? value : Number(value) || 0;
              return [formatTwd(n), "預測現金"];
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
          />
          <ReferenceLine
            y={threshold}
            stroke={thresholdColor}
            strokeDasharray="4 4"
            label={{
              value: `安全線 ${formatCompact(threshold)}`,
              position: "insideTopRight",
              fill: thresholdColor,
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="cash"
            stroke={lineColor}
            strokeWidth={2.5}
            fill="url(#cashGradient)"
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
