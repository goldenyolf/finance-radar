"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useTheme } from "next-themes";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";

import { formatCurrency } from "@/lib/dashboard";
import type { SankeyData, SankeyNode } from "@/lib/sankey-data";

interface Props {
  data: SankeyData;
}

// Recharts 從 root 沒 export 這些 props 型別 — inline 抄一份夠用就好
interface SankeyNodeRenderProps {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: SankeyNode;
  index: number;
}

interface SankeyLinkRenderProps {
  sourceX: number;
  sourceY: number;
  sourceControlX: number;
  targetControlX: number;
  targetX: number;
  targetY: number;
  linkWidth: number;
  index: number;
  payload: {
    source: SankeyNode;
    target: SankeyNode;
    value: number;
  };
}

/**
 * 桑基圖：本月「收入分類 → 帳戶 → 支出分類」三層金流。
 * 客製 Node / Link renderer 達成 Apple 風配色 + 半透明流線。
 */
export function CashflowSankeyChart({ data }: Props) {
  // 主題感知：dark 用更飽和的霓虹色（Bloomberg 風），light 維持柔和淺色
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  // expense 節點維持 EXPENSE_CATEGORY_COLOR（橘/粉/焦糖等，明暗都可讀）；
  // income / account 改用 theme-aware 色階，保留資料純函式不污染。
  const themedData = useMemo<SankeyData>(() => {
    const incomeColor = isDark ? "#22c55e" : "#86efac"; // emerald-500 vs emerald-300
    const accountColor = isDark ? "#3b82f6" : "#93c5fd"; // blue-500 vs blue-300
    return {
      ...data,
      nodes: data.nodes.map((n) => {
        if (n.type === "income") return { ...n, color: incomeColor };
        if (n.type === "account") return { ...n, color: accountColor };
        return n;
      }),
    };
  }, [data, isDark]);

  if (data.links.length === 0) {
    return (
      <div className="grid h-[460px] w-full place-items-center rounded-lg border border-dashed border-foreground/10 bg-muted/30 text-center text-xs text-muted-foreground">
        該月份尚無收支紀錄可繪製金流
      </div>
    );
  }

  return (
    <ScrollableSankey>
      <div className="min-w-[640px] md:min-w-0">
        <div className="h-[460px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <Sankey
              data={themedData}
              nodePadding={28}
              nodeWidth={12}
              linkCurvature={0.55}
              iterations={64}
              margin={{ top: 16, right: 140, bottom: 16, left: 110 }}
              node={(nodeProps) => (
                <SankeyNodeShape
                  {...(nodeProps as unknown as SankeyNodeRenderProps)}
                />
              )}
              link={(linkProps) => (
                <SankeyLinkShape
                  {...(linkProps as unknown as SankeyLinkRenderProps)}
                />
              )}
            >
              <Tooltip
                cursor={false}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "var(--card-foreground)",
                  padding: "8px 12px",
                }}
                formatter={(value: unknown) => {
                  const n = typeof value === "number" ? value : Number(value) || 0;
                  return [formatCurrency(n), "金額"];
                }}
                labelFormatter={(_label, items) => {
                  if (!items || items.length === 0) return "";
                  const payload = items[0]?.payload as
                    | { source?: SankeyNode; target?: SankeyNode; name?: string }
                    | undefined;
                  if (!payload) return "";
                  if (payload.source && payload.target) {
                    return `${payload.source.name} → ${payload.target.name}`;
                  }
                  return payload.name ?? "";
                }}
              />
            </Sankey>
          </ResponsiveContainer>
        </div>
      </div>
    </ScrollableSankey>
  );
}

/* ─────────────────── Mobile scroll wrapper ─────────────────── */

/**
 * 行動版桑基圖橫向 scroll 容器 — recharts Sankey 沒有垂直流向支援，最低成本
 * 體驗：
 *   1. 上方 hint badge「← 左右滑動 →」只在 mobile 顯示且還沒滑過時才出現
 *   2. 右側漸層 fade，scrollLeft >= maxScroll - 4 時才隱藏（暗示「還有內容」）
 *   3. md+ 直接全寬 render，沒有任何 scroll 裝飾
 */
function ScrollableSankey({ children }: { children: React.ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      if (el.scrollLeft > 4) setHasScrolled(true);
      setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="relative">
      {/* 滑動提示：只在 mobile + 還沒滑過時顯示 */}
      {!hasScrolled && (
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 md:hidden">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/85 px-3 py-1 text-[11px] font-medium text-background shadow-sm backdrop-blur-sm">
            <ArrowLeftRight className="size-3" />
            左右滑動瀏覽完整金流
          </span>
        </div>
      )}

      <div
        ref={scrollerRef}
        className="-mx-2 overflow-x-auto overscroll-x-contain px-2 [scrollbar-width:thin] md:mx-0 md:overflow-x-visible md:px-0"
      >
        {children}
      </div>

      {/* 右側漸層：到底了就淡出 */}
      <div
        aria-hidden
        className={`pointer-events-none absolute top-0 right-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent transition-opacity duration-200 md:hidden ${
          atEnd ? "opacity-0" : "opacity-100"
        }`}
      />
    </div>
  );
}

/* ─────────────────────────── Custom Node ─────────────────────────── */

function SankeyNodeShape(props: SankeyNodeRenderProps) {
  const { x, y, width, height, payload } = props;
  const node = payload as SankeyNode;
  // 右側欄（支出）label 放 rect 的左邊；其他放右邊
  const isRight = node.type === "expense";
  const labelX = isRight ? x - 8 : x + width + 8;
  const textAnchor = isRight ? "end" : "start";

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={node.color}
        rx={3}
        ry={3}
      />
      <text
        x={labelX}
        y={y + height / 2}
        dy={4}
        textAnchor={textAnchor}
        fontSize={12}
        fontWeight={500}
        fill="var(--foreground)"
        opacity={0.85}
      >
        {node.name}
      </text>
    </g>
  );
}

/* ─────────────────────────── Custom Link ─────────────────────────── */

function SankeyLinkShape(props: SankeyLinkRenderProps) {
  const {
    sourceX,
    sourceY,
    sourceControlX,
    targetControlX,
    targetX,
    targetY,
    linkWidth,
    payload,
  } = props;

  // payload.source / payload.target 是完整 node 物件（含我們塞的 color）
  const sourceNode = payload.source as SankeyNode;
  const stroke = sourceNode?.color ?? "#94A3B8";

  // 標準 Sankey link 走 cubic bezier，stroke 模式比 path-fill 更簡潔
  const d = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;

  return (
    <path
      d={d}
      stroke={stroke}
      strokeWidth={Math.max(1, linkWidth)}
      strokeOpacity={0.45}
      fill="none"
      style={{ transition: "stroke-opacity 0.15s ease" }}
    />
  );
}
