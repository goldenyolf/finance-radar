"use client";

import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 圖表空白狀態 — Recharts 圖表零資料時的精緻 fallback。
 *
 * 設計理念：
 *   - 不只是 "尚無資料" 純文字 box，而是用半透明 mock 圖當背景，給使用者
 *     即將出現的視覺預告 + 引導行動。
 *   - 背景 layer (opacity-[0.12]) 用對應形狀的 mock data 畫，pointer-events
 *     全關不干擾互動；前景 layer 放 Lucide BarChart3 icon + 中文引導。
 *
 * 三種變體對應實際圖表：
 *   pie  → 圓餅 (ExpensePieChart)
 *   area → 面積/折線 (NetWorthTrendChart / CashflowLineChart)
 *
 * 跟 ChartEmptyState 同 height-72 設計 — 直接 drop-in 不破壞父層 layout。
 */

interface Props {
  variant: "pie" | "area";
  /** 自訂高度 className，預設 h-72 跟既有圖表一致 */
  className?: string;
  /** 自訂訊息文字 */
  message?: string;
}

const DEFAULT_MESSAGE =
  "📊 戰情室正在等待數據，試著新增您的第一筆帳務吧！";

// 5 片 mock pie 視覺權重接近常見類別分布，視覺上像「平均的家用預算」
const MOCK_PIE_DATA = [
  { name: "1", value: 35 },
  { name: "2", value: 25 },
  { name: "3", value: 18 },
  { name: "4", value: 12 },
  { name: "5", value: 10 },
];

// 6 點向上微弧的面積曲線，符合「淨資產緩步成長」的暗示
const MOCK_AREA_DATA = [
  { x: 1, y: 100 },
  { x: 2, y: 108 },
  { x: 3, y: 116 },
  { x: 4, y: 122 },
  { x: 5, y: 132 },
  { x: 6, y: 140 },
];

export function ChartEmptyState({
  variant,
  className,
  message = DEFAULT_MESSAGE,
}: Props) {
  return (
    <div
      className={cn(
        "relative h-72 w-full overflow-hidden rounded-lg border border-dashed border-foreground/10 bg-muted/20",
        className
      )}
      role="status"
      aria-label="圖表尚無資料"
    >
      {/* mock 背景 — currentColor 配低 opacity，自動跟著 dark/light 主題走 */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] text-foreground">
        <ResponsiveContainer width="100%" height="100%">
          {variant === "pie" ? (
            <PieChart>
              <Pie
                data={MOCK_PIE_DATA}
                dataKey="value"
                innerRadius="50%"
                outerRadius="80%"
                paddingAngle={3}
                stroke="none"
                isAnimationActive={false}
              >
                {MOCK_PIE_DATA.map((_, i) => (
                  <Cell key={i} fill="currentColor" />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <AreaChart
              data={MOCK_AREA_DATA}
              margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
            >
              <defs>
                <linearGradient id="emptyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="y"
                stroke="currentColor"
                strokeWidth={2}
                fill="url(#emptyGradient)"
                isAnimationActive={false}
                dot={false}
                activeDot={false}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* 前景訊息層 — icon + 文字置中 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-6 text-center">
        <BarChart3
          className="size-9 text-muted-foreground/50"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="max-w-[20rem] text-xs leading-relaxed text-muted-foreground/80">
          {message}
        </p>
      </div>
    </div>
  );
}
