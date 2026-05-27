"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatTwd, type NetWorthPoint } from "@/lib/wealth";

interface Props {
  data: NetWorthPoint[];
}

function formatCompact(n: number): string {
  return new Intl.NumberFormat("zh-TW", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/**
 * 淨資產趨勢 Area Chart。
 *
 * 配色：theme-aware emerald / rose 漸層 — 跟 NetWorthCards 的色票一致，
 * 視覺上一掃就懂「綠色資產減紅色負債 = 中間這條曲線」。
 *
 * < 2 個資料點直接顯示 empty hint，因為 Area Chart 只一個點看起來像 bug。
 */
export function NetWorthTrendChart({ data }: Props) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  if (data.length === 0) {
    return (
      <div className="grid h-72 w-full place-items-center rounded-lg border border-dashed border-foreground/10 bg-muted/30 text-center text-xs text-muted-foreground">
        還沒拍過任何資產快照 — 拍第一張開始就會出現起點
      </div>
    );
  }

  // 淨資產整體為正 → emerald；最後一點負 → rose；中性 → indigo
  const lastNet = data[data.length - 1]?.net_worth ?? 0;
  const isNegative = lastNet < 0;
  const lineColor = isNegative
    ? isDark
      ? "#f87171" // rose-400
      : "#ef4444" // rose-500
    : isDark
      ? "#34d399" // emerald-400
      : "#10b981"; // emerald-500
  const gradientOpacity = isDark ? 0.4 : 0.3;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
        >
          <defs>
            <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={lineColor}
                stopOpacity={gradientOpacity}
              />
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
            cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--card-foreground)",
            }}
            formatter={(value, name) => {
              const n = typeof value === "number" ? value : Number(value) || 0;
              const label =
                name === "net_worth"
                  ? "淨資產"
                  : name === "total_assets"
                    ? "總資產"
                    : "總負債";
              return [formatTwd(n), label];
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
          />
          <Area
            type="monotone"
            dataKey="net_worth"
            stroke={lineColor}
            strokeWidth={2.5}
            fill="url(#netWorthGradient)"
            /*
              1 點時 area 無法形成多邊形，必須靠 dot 才看得到那個點；
              2+ 點走標準曲線。dot 跟 activeDot 用同色保持視覺一致。
            */
            dot={{ r: 4, strokeWidth: 0, fill: lineColor }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
