"use client";

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
  if (data.links.length === 0) {
    return (
      <div className="grid h-[460px] w-full place-items-center rounded-lg border border-dashed border-foreground/10 bg-muted/30 text-center text-xs text-muted-foreground">
        該月份尚無收支紀錄可繪製金流
      </div>
    );
  }

  return (
    <div className="-mx-2 overflow-x-auto px-2 md:mx-0 md:overflow-x-visible md:px-0">
      <div className="min-w-[720px] md:min-w-0">
        <div className="h-[460px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <Sankey
              data={data}
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
