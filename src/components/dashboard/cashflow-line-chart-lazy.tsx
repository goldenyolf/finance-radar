"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

/**
 * recharts 是本專案最重的依賴（~100KB+ gzipped）。首頁的現金流預測圖位於
 * fold 以下（板塊卡 / 訂閱 / 夢想基金之後），沒必要進首屏 JS。用 ssr:false
 * dynamic 讓它連同 recharts 切成獨立 async chunk，hydration 後才載入。
 *
 * Server Component 不允許 ssr:false，故本 wrapper 標 "use client" 作為邊界。
 * loading fallback 與圖等高（h-72）避免版位跳動（CLS）。原圖 mounted 前也只
 * 顯示 light 主題暫態，延後到 client 載入的 UX 落差極小。
 */
const CashflowLineChart = dynamic(
  () => import("./cashflow-line-chart").then((m) => m.CashflowLineChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 w-full animate-pulse rounded-lg bg-muted/40" />
    ),
  }
);

export function CashflowLineChartLazy(
  props: ComponentProps<typeof import("./cashflow-line-chart").CashflowLineChart>
) {
  return <CashflowLineChart {...props} />;
}
