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
          // 主 % 緊扣圓餅：永遠 = 該分類佔當月總消費比例（per UAT spec part 2）。
          // 全分類加總保證 = 100%，跟左側 PieChart 視覺一一對應、不再混入預算進度。
          const totalPct = total > 0 ? (slice.amount / total) * 100 : 0;
          const budget = slice.budget > 0 ? slice.budget : 0;
          const hasBudget = budget > 0;
          const budgetPct = hasBudget ? (slice.amount / budget) * 100 : 0;
          const tone = budgetTone(budgetPct);
          const overshoot = hasBudget && budgetPct >= 100;
          const barWidth = Math.min(100, budgetPct);

          return (
            <li
              key={slice.category}
              className="flex flex-col gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted/40"
            >
              {/*
                Header row — 主結構：左側分類名 + 右側「金額 · 佔總比 %」。
                這個 % 永遠 = 圓餅圖比例，不再隨預算 toggle 切換。
              */}
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="truncate font-medium">{slice.label}</span>
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums">
                  <span className="font-medium text-foreground">
                    <Money value={slice.amount} format={formatTwd} />
                  </span>
                  <span className="ml-1.5 text-muted-foreground">
                    {totalPct.toFixed(0)}%
                  </span>
                </span>
              </div>

              {/*
                預算進度 — 可選次要資訊，放到下方視覺解耦。
                標籤改「已用 X%」明示「這是預算用量」，與圓餅圖比例徹底分離。
                沒設預算的分類整段不渲染。
              */}
              {hasBudget && (
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-baseline justify-between text-[10px] leading-none text-muted-foreground/70">
                    <span>預算進度</span>
                    <span className={`tabular-nums ${tone.text}`}>
                      已用 {budgetPct.toFixed(0)}%
                    </span>
                  </div>
                  <div
                    className={`h-1 w-full overflow-hidden rounded-full ${tone.track}`}
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
                  <div className="flex items-baseline justify-between text-[10px] leading-none text-muted-foreground/60">
                    <span className="tabular-nums">
                      / <Money value={budget} format={formatTwd} />
                    </span>
                    {overshoot && (
                      <span className={`font-medium ${tone.text}`}>
                        超支{" "}
                        <Money
                          value={slice.amount - budget}
                          format={formatTwd}
                        />
                      </span>
                    )}
                  </div>
                </div>
              )}
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
