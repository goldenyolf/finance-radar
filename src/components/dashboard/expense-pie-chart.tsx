"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

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

export function ExpensePieChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="grid h-72 w-full place-items-center rounded-lg border border-dashed border-foreground/10 bg-muted/30 text-center text-xs text-muted-foreground">
        本月尚無已記帳的花費
      </div>
    );
  }

  const total = data.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="h-72 w-full sm:flex-1">
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

      <ul className="flex w-full flex-col gap-1.5 text-sm sm:w-56">
        {data.map((slice) => {
          const pct = total > 0 ? (slice.amount / total) * 100 : 0;
          return (
            <li
              key={slice.category}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="truncate">{slice.label}</span>
              </span>
              <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                <span className="text-foreground font-medium">
                  {formatTwd(slice.amount)}
                </span>
                <span className="ml-1">· {pct.toFixed(0)}%</span>
              </span>
            </li>
          );
        })}
        <li className="mt-1 flex items-center justify-between gap-3 border-t border-foreground/10 pt-2 px-2">
          <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            合計
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {formatTwd(total)}
          </span>
        </li>
      </ul>
    </div>
  );
}
