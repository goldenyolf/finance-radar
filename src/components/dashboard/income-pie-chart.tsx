"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { ChartEmptyState } from "@/components/dashboard/chart-empty-state";
import { Money } from "@/components/ui/money";
import type { IncomeCategorySlice } from "@/lib/income-categories";

interface Props {
  data: IncomeCategorySlice[];
}

function formatTwd(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * 本月收入結構 — 配 ExpensePieChart 的視覺對稱版本。
 *
 * 比 ExpensePieChart 簡：沒有「分類預算進度條」的概念（收入沒有預算上限），
 * 只列「佔總收入 %」+ 金額。動畫 500ms 與全站 Recharts 設定對齊。
 */
export function IncomePieChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <ChartEmptyState
        variant="pie"
        message="📊 本月尚未記錄任何收入。傳一句「薪水 75000」到 LINE 就能立刻入帳。"
      />
    );
  }

  const total = data.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_260px] sm:items-center">
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="label"
              innerRadius="58%"
              outerRadius="86%"
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive
              animationDuration={500}
            >
              {data.map((slice) => (
                <Cell key={slice.category} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              cursor={{ fill: "transparent" }}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
                color: "var(--card-foreground)",
              }}
              formatter={(value, name) => {
                const n = typeof value === "number" ? value : Number(value) || 0;
                const pct = total > 0 ? (n / total) * 100 : 0;
                return [
                  `${formatTwd(n)}（${pct.toFixed(1)}%）`,
                  String(name),
                ];
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={32}
              iconType="circle"
              wrapperStyle={{
                fontSize: 12,
                color: "var(--muted-foreground)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex w-full flex-col gap-2 text-sm">
        {data.map((slice) => {
          const totalPct = total > 0 ? (slice.amount / total) * 100 : 0;
          return (
            <li
              key={slice.category}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="truncate">{slice.label}</span>
              </span>
              <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">
                  <Money value={slice.amount} format={formatTwd} />
                </span>
                <span className="ml-1">· {totalPct.toFixed(0)}%</span>
              </span>
            </li>
          );
        })}
        <li className="mt-1 flex items-center justify-between gap-3 border-t border-foreground/10 px-2 pt-2">
          <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            本月入帳
          </span>
          <span className="text-sm font-semibold tabular-nums">
            <Money value={total} format={formatTwd} />
          </span>
        </li>
      </ul>
    </div>
  );
}
