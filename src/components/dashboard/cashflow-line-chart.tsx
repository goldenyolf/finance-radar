"use client";

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

const MOCK: CashflowPoint[] = [
  { label: "5月", cash: 312000 },
  { label: "6月", cash: 295500 },
  { label: "7月", cash: 271200 },
  { label: "8月", cash: 263800 },
  { label: "9月", cash: 248100 },
  { label: "10月", cash: 232400 },
  { label: "11月", cash: 215000 },
  { label: "12月", cash: 198750 },
];

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
  const points = data && data.length > 0 ? data : MOCK;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
        >
          <defs>
            <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
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
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{
              value: `安全線 ${formatCompact(threshold)}`,
              position: "insideTopRight",
              fill: "#ef4444",
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="cash"
            stroke="#6366f1"
            strokeWidth={2.5}
            fill="url(#cashGradient)"
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
