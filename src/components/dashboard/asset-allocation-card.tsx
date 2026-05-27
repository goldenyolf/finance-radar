"use client";

import { useMemo } from "react";
import { PieChart as PieChartIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Money } from "@/components/ui/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatTwd,
  numW,
  type WealthSnapshotRow,
} from "@/lib/wealth";

interface Props {
  /** 最新一筆快照 — 沒有就走 empty state */
  latest: WealthSnapshotRow | null;
}

/**
 * Apple 金融風配色池 — wealth_accounts 沒原生 color 欄位，用 id 順序
 * 對應這池。10 色循環，足以涵蓋一般人的資產種類數（很少超過 10 個）。
 */
const ALLOCATION_PALETTE = [
  "#3B82F6", // blue-500
  "#10B981", // emerald-500
  "#F59E0B", // amber-500
  "#8B5CF6", // violet-500
  "#EC4899", // pink-500
  "#14B8A6", // teal-500
  "#6366F1", // indigo-500
  "#F43F5E", // rose-500
  "#F97316", // orange-500
  "#0EA5E9", // sky-500
];

interface AllocationSlice {
  account_id: string;
  name: string;
  value: number;
  /** 0-100 (1 位小數) */
  percent: number;
  color: string;
}

/**
 * 資產配置分佈圓餅圖。
 *
 * 邏輯：抓最新快照的 details，只取 type='asset' 且 value>0 的 row，
 * 依金額比例切片。負債（liability）刻意排除 — 「資產配置」概念上
 * 就是分析「我的錢分散在哪些 asset bucket」，混入負債會把佔比稀釋
 * 得沒意義。
 *
 * 視覺：圓餅 + 右側佔比清單。手機版直向堆疊（pie 在上、清單在下），
 * sm+ 走橫向（pie 左、清單右）。金額一律 <Money> 自動受防窺 blur。
 */
export function AssetAllocationCard({ latest }: Props) {
  const slices = useMemo<AllocationSlice[]>(() => {
    if (!latest) return [];
    const assets = latest.details
      .filter((d) => d.type === "asset" && numW(d.value) > 0)
      .map((d) => ({
        account_id: d.account_id,
        name: d.name,
        value: numW(d.value),
      }));
    const total = assets.reduce((s, a) => s + a.value, 0);
    if (total <= 0) return [];

    return assets
      .map((a, idx) => ({
        ...a,
        percent: Math.round((a.value / total) * 1000) / 10,
        color: ALLOCATION_PALETTE[idx % ALLOCATION_PALETTE.length],
      }))
      .sort((a, b) => b.value - a.value); // 大宗在前
  }, [latest]);

  const totalAssets = slices.reduce((s, x) => s + x.value, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">🥧 資產配置分佈</CardTitle>
        </div>
        <CardDescription className="mt-1">
          目前各資產 bucket 的佔比；只看正資產，負債分開檢視。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {slices.length === 0 ? (
          <div className="grid h-56 place-items-center rounded-lg border border-dashed border-foreground/10 bg-muted/30 text-center text-xs text-muted-foreground">
            還沒拍過資產快照 — 點上方「📸 更新本月資產快照」開始
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-center">
            {/* Pie */}
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="var(--background)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {slices.map((s) => (
                      <Cell key={s.account_id} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                      color: "var(--card-foreground)",
                      padding: "8px 12px",
                    }}
                    formatter={(value, name) => {
                      const n =
                        typeof value === "number" ? value : Number(value) || 0;
                      const pct = totalAssets > 0
                        ? ((n / totalAssets) * 100).toFixed(1)
                        : "0";
                      return [`${formatTwd(n)} (${pct}%)`, String(name)];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 佔比清單 */}
            <ul className="flex flex-col gap-1.5">
              {slices.map((s) => (
                <li
                  key={s.account_id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="truncate text-sm">{s.name}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    <span className="font-medium text-foreground">
                      <Money value={s.value} format={formatTwd} />
                    </span>
                    <span className="ml-1.5 font-semibold text-foreground">
                      {s.percent.toFixed(1)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
