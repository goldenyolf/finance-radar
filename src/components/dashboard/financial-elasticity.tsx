"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, PartyPopper, Scale } from "lucide-react";
import { useTheme } from "next-themes";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { HelpTip } from "@/components/ui/help-tip";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/dashboard";
import type {
  ElasticityTier,
  FinancialElasticityData,
} from "@/lib/financial-elasticity";

interface Props {
  data: FinancialElasticityData;
}

/**
 * 財務彈性計量盤 — 左側甜甜圈圖（固定 vs 浮動）+ 右側硬性負擔率大字。
 *
 * 視覺隱喻：
 *   - 固定支出 slate-700（沉重、死錢、被綁住的顏色）
 *   - 浮動支出 amber-500（活力、自由分配、彈性的顏色）
 * 一眼看到「我有多少錢是被綁死的」vs「多少是還能調動的」。
 *
 * 大字 burdenRate 依 tier 染色（safe emerald / watch orange / alert rose），
 * 跟 Phase 3 即將塞進來的智囊 Alert 共用 tier 配色 → 視覺一致。
 *
 * 防窺：burdenRate %（data-money）+ 細項金額（<Money>）+ 圓餅 tooltip
 * （globals.css recharts-tooltip-wrapper rule）全部自動 blur。
 */
export function FinancialElasticity({ data }: Props) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  // theme-aware：dark mode 固定色從 slate-700 提亮到 slate-500，避免在暗背景看不到
  const fixedColor = isDark ? "#64748B" : "#334155"; // slate-500 / 700
  const variableColor = isDark ? "#FBBF24" : "#F59E0B"; // amber-400 / 500

  const slices = buildPieSlices(data, fixedColor, variableColor);
  const tier = data.tier;
  const tierClass = TIER_TEXT_CLASS[tier];

  const hasAnyActivity = data.totalIncome > 0 || data.totalExpense > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">⚖️ 財務彈性 — 固定 vs 浮動</CardTitle>
        </div>
        <CardDescription className="mt-1">
          硬性負擔率 = 固定支出 ÷ 總收入。越低代表發薪水後越多錢可自由分配
          （投資、夢想基金、緊急預備金）。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAnyActivity ? (
          <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-4 py-10 text-center text-xs text-muted-foreground">
            本月還沒有任何收支紀錄，無法計算負擔率
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center">
            {/* 左：甜甜圈 */}
            <div className="mx-auto h-48 w-48 sm:mx-0">
              {slices.length === 0 ? (
                <div className="grid h-full w-full place-items-center rounded-full border border-dashed border-foreground/10 text-[11px] text-muted-foreground">
                  本月無支出
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                      stroke="var(--background)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {slices.map((s, i) => (
                        <Cell key={i} fill={s.color} />
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
                        const pct =
                          data.totalExpense > 0
                            ? ((n / data.totalExpense) * 100).toFixed(1)
                            : "0";
                        return [`${formatCurrency(n)} (${pct}%)`, String(name)];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 右：負擔率大字 + breakdown */}
            <div className="flex flex-col gap-4">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  財務硬性負擔率
                  <HelpTip ariaLabel="財務硬性負擔率說明">
                    💡 計算公式：(固定支出 ÷ 總收入) × 100%。固定支出包含房貸、托育、保險等避不掉的「死錢」。理財學上建議此比率維持在 30% 以下，若超過 60% 代表財務空間被嚴重壓迫，一發薪水即被綁死。
                  </HelpTip>
                </p>
                <p
                  className={`mt-1 text-5xl font-bold tabular-nums tracking-tight ${tierClass}`}
                >
                  {data.burdenRate === null ? (
                    <span className="text-muted-foreground/60">—</span>
                  ) : (
                    <span data-money>{data.burdenRate.toFixed(1)}%</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {TIER_HINT[tier]}
                </p>
              </div>

              <dl className="flex flex-col gap-1.5 text-sm tabular-nums">
                <Row
                  label="固定支出"
                  value={data.fixedExpense}
                  dotColor={fixedColor}
                />
                <Row
                  label="浮動支出"
                  value={data.variableExpense}
                  dotColor={variableColor}
                />
                <Row
                  label="總收入"
                  value={data.totalIncome}
                  dotColor={isDark ? "#34d399" : "#10b981"}
                />
              </dl>
            </div>
          </div>
        )}

        {/*
          財富智囊 — 依 tier 動態文案。刻意塞在同一張卡（不獨立卡）：
          建議跟負擔率視覺上耦合，使用者一掃就「看到數字 → 看到對應建議」，
          中間隔張卡反而割裂語境。

          防呆：本月零收入 + 有支出 → tier 算出來會是 safe（fixed/0 = NaN，邏輯
          掉到 safe 預設），但實際上是「靠存量燒錢」的高風險狀態。攔截後改顯示
          黃色 NoIncomeAlert，不誤導使用者「彈性絕佳」。
        */}
        {hasAnyActivity &&
          (data.totalIncome === 0 ? (
            <NoIncomeAlert />
          ) : (
            <AdvisorAlert tier={tier} />
          ))}
      </CardContent>
    </Card>
  );
}

/* ─────────────────── No-income guard ─────────────────── */

/**
 * 本月零收入專屬 alert — 蓋過 tier-based 文案，避免「totalIncome=0 →
 * burdenRate=NaN/null → tier 預設 safe → 誤判財務彈性絕佳」的邏輯陷阱。
 */
function NoIncomeAlert() {
  return (
    <Alert
      className={cn(
        "mt-6 border-amber-500/30 bg-amber-500/[0.04] text-foreground ring-1 ring-amber-500/20",
        "*:data-[slot=alert-description]:text-amber-700 dark:*:data-[slot=alert-description]:text-amber-200",
        "*:[svg]:text-amber-500 dark:*:[svg]:text-amber-400"
      )}
    >
      <AlertTriangle className="size-4" />
      <AlertTitle className="font-semibold">⚠️ 本月尚無收入進帳</AlertTitle>
      <AlertDescription className="leading-relaxed">
        目前支出全數由存量資金流出，請密切注意浮動開銷的累積速度。建議到「歷史時光機」對照上個月的儲蓄率，確認支出節奏是否需要收斂。
      </AlertDescription>
    </Alert>
  );
}

/* ─────────────────── Advisor Alert ─────────────────── */

const TIER_ALERT_CONFIG: Record<
  ElasticityTier,
  {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    description: string;
    className: string;
  }
> = {
  safe: {
    icon: PartyPopper,
    title: "🎉 您的財務彈性絕佳！",
    description:
      "每個月有充足的自由現金流可投入「夢想基金」或加速資產滾雪球。",
    className:
      "mt-6 border-emerald-500/30 bg-emerald-500/[0.04] text-foreground ring-1 ring-emerald-500/20 *:data-[slot=alert-description]:text-emerald-700 dark:*:data-[slot=alert-description]:text-emerald-300 *:[svg]:text-emerald-600 dark:*:[svg]:text-emerald-400",
  },
  watch: {
    icon: Scale,
    title: "⚖️ 財務負擔處於可控區間",
    description:
      "建議檢視是否有非必要的固定扣款或訂閱制正在默默蠶食您的收入。",
    className:
      "mt-6 border-orange-500/30 bg-orange-500/[0.04] text-foreground ring-1 ring-orange-500/20 *:data-[slot=alert-description]:text-orange-700 dark:*:data-[slot=alert-description]:text-orange-300 *:[svg]:text-orange-600 dark:*:[svg]:text-orange-400",
  },
  alert: {
    icon: AlertTriangle,
    title: "⚠️ 警告：您的硬性負擔已破安全門檻！",
    description:
      "這意味著您一發薪水就有超過六成被強制綁死。建議重整家庭固定開銷，或嘗試透過副業增加「存入」金流以釋放壓力。",
    className:
      "mt-6 border-rose-500/30 bg-rose-500/[0.04] text-foreground ring-1 ring-rose-500/20 *:data-[slot=alert-description]:text-rose-700 dark:*:data-[slot=alert-description]:text-rose-300 *:[svg]:text-rose-600 dark:*:[svg]:text-rose-400",
  },
};

function AdvisorAlert({ tier }: { tier: ElasticityTier }) {
  const config = TIER_ALERT_CONFIG[tier];
  const Icon = config.icon;
  return (
    <Alert className={config.className}>
      <Icon className="size-4" />
      <AlertTitle className="font-semibold">{config.title}</AlertTitle>
      <AlertDescription className="leading-relaxed">
        {config.description}
      </AlertDescription>
    </Alert>
  );
}

/* ─────────────────── helpers ─────────────────── */

const TIER_TEXT_CLASS: Record<ElasticityTier, string> = {
  safe: "text-emerald-500",
  watch: "text-orange-500",
  alert: "text-rose-500",
};

const TIER_HINT: Record<ElasticityTier, string> = {
  safe: "極具彈性 — 大部分收入還能自由分配",
  watch: "可控區間 — 留意新增的固定扣款",
  alert: "高度警戒 — 一發薪即被綁死六成以上",
};

interface PieSlice {
  name: string;
  value: number;
  color: string;
}

function buildPieSlices(
  data: FinancialElasticityData,
  fixedColor: string,
  variableColor: string
): PieSlice[] {
  const slices: PieSlice[] = [];
  if (data.fixedExpense > 0) {
    slices.push({ name: "固定支出", value: data.fixedExpense, color: fixedColor });
  }
  if (data.variableExpense > 0) {
    slices.push({
      name: "浮動支出",
      value: data.variableExpense,
      color: variableColor,
    });
  }
  return slices;
}

function Row({
  label,
  value,
  dotColor,
}: {
  label: string;
  value: number;
  dotColor: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        {label}
      </dt>
      <dd className="font-medium">
        <Money value={value} />
      </dd>
    </div>
  );
}
