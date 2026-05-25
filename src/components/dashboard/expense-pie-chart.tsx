"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export type ExpenseSlice = {
  category: string;
  amount: number;
};

type Props = {
  data?: ExpenseSlice[];
};

const MOCK: ExpenseSlice[] = [
  { category: "居住", amount: 18000 },
  { category: "餐飲", amount: 7800 },
  { category: "交通", amount: 3200 },
  { category: "訂閱", amount: 1450 },
  { category: "娛樂", amount: 2600 },
  { category: "其他", amount: 1900 },
];

const PALETTE = [
  "#6366f1",
  "#22d3ee",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#a855f7",
];

function formatTwd(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function ExpensePieChart({ data }: Props) {
  const slices = data && data.length > 0 ? data : MOCK;
  const total = slices.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="amount"
            nameKey="category"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
            stroke="var(--card)"
            strokeWidth={2}
          >
            {slices.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
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
              return [
                `${formatTwd(n)} (${((n / total) * 100).toFixed(1)}%)`,
                String(name),
              ];
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={32}
            iconType="circle"
            wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
