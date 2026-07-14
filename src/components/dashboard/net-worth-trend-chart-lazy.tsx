"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

/**
 * 同 cashflow-line-chart-lazy：把 recharts 從 /net-worth 首屏 JS 切出去。
 * 淨資產趨勢圖靠 client 端主題色與 ResponsiveContainer，延後載入零損失。
 */
const NetWorthTrendChart = dynamic(
  () => import("./net-worth-trend-chart").then((m) => m.NetWorthTrendChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-lg bg-muted/40" />
    ),
  }
);

export function NetWorthTrendChartLazy(
  props: ComponentProps<typeof import("./net-worth-trend-chart").NetWorthTrendChart>
) {
  return <NetWorthTrendChart {...props} />;
}
