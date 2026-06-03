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
import type { CategorySlice } from "@/lib/expense-categories";

type Props = {
  data: CategorySlice[];
};

function formatTwd(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** 預算消耗色階 — 跟 BoardCard 的預算消耗條保持一致 token：safe / warn / danger */
function budgetTone(pct: number): {
  bar: string;
  track: string;
  text: string;
} {
  if (pct >= 100) {
    return {
      bar: "bg-rose-500",
      track: "bg-rose-500/15",
      text: "text-rose-600 dark:text-rose-400",
    };
  }
  if (pct >= 80) {
    return {
      bar: "bg-amber-500",
      track: "bg-amber-500/15",
      text: "text-amber-600 dark:text-amber-400",
    };
  }
  return {
    bar: "bg-emerald-500",
    track: "bg-emerald-500/15",
    text: "text-emerald-400",
  };
}

export function ExpensePieChart({ data }: Props) {
  if (data.length === 0) {
    return <ChartEmptyState variant="pie" />;
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
          const budget = slice.budget > 0 ? slice.budget : undefined;
          const totalPct = total > 0 ? (slice.amount / total) * 100 : 0;

          if (budget && budget > 0) {
            // 有預算 → 顯示 budget-relative 進度條
            const budgetPct = (slice.amount / budget) * 100;
            const tone = budgetTone(budgetPct);
            const overshoot = budgetPct >= 100;
            const barWidth = Math.min(100, budgetPct);
            return (
              <li
                key={slice.category}
                className="flex flex-col gap-1 rounded-md px-2 py-1.5 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="truncate font-medium">{slice.label}</span>
                  </span>
                  <span
                    className={`shrink-0 text-xs tabular-nums ${tone.text}`}
                  >
                    {budgetPct.toFixed(0)}%
                  </span>
                </div>
                <div
                  className={`h-1.5 w-full overflow-hidden rounded-full ${tone.track}`}
                  role="progressbar"
                  aria-valuenow={Math.round(budgetPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${slice.label} 預算消耗`}
                >
                  <div
                    className={`h-full rounded-full ${tone.bar}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">
                      <Money value={slice.amount} format={formatTwd} />
                    </span>{" "}
                    / <Money value={budget} format={formatTwd} />
                  </span>
                  {overshoot && (
                    <span className={`font-medium ${tone.text}`}>
                      超支 <Money value={slice.amount - budget} format={formatTwd} />
                    </span>
                  )}
                </div>
              </li>
            );
          }

          // 沒預算 → 維持原本「金額 · 佔總比」的緊湊呈現
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
            合計
          </span>
          <span className="text-sm font-semibold tabular-nums">
            <Money value={total} format={formatTwd} />
          </span>
        </li>
      </ul>
    </div>
  );
}
