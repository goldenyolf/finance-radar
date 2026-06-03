"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Minus, PiggyBank } from "lucide-react";

import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { Card } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { num, type TransactionRow } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

interface Props {
  transactions: TransactionRow[];
  /** 當前焦點月份（時光機切換時跟著動） */
  monthDate: Date;
}

interface MonthTotals {
  income: number;
  expense: number;
}

/**
 * 頂部 3 欄核心總覽 — Apple 三字報格局。
 *
 * 欄位語意：
 *   A. 本月總支出（大字 rose）+ 較上月同期變動率（紅↑/綠↓/灰持平）
 *   B. 本月總收入（大字 emerald）
 *   C. 儲蓄率 = (income - expense) / income；無收入時走「—」+ 文案防呆
 *
 * MoM 變動率採「同月份對比」：本月 (Y/M) vs 上月 (Y/M-1) 全月加總。
 * 用全月而非「同一日切片」— 月初看當月只有 5 天，跟上月 30 天比沒意義；
 * 全月對全月才是 fair comparison（即使本月還沒過完也視同當前快照）。
 *
 * 自包含 month totals 計算 — 不依賴外部 buildFinancialElasticity，避免
 * 為了拿兩個總和把整支重 tier 算兩次。
 */
export function MonthHeadlineCards({ transactions, monthDate }: Props) {
  const { current, previous } = useMemo(() => {
    const prevDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
    return {
      current: aggregateMonth(transactions, monthDate),
      previous: aggregateMonth(transactions, prevDate),
    };
  }, [transactions, monthDate]);

  const expenseDelta = computeDelta(current.expense, previous.expense);
  const savingsRate =
    current.income > 0
      ? ((current.income - current.expense) / current.income) * 100
      : null;

  return (
    <section
      aria-label="本月核心數據"
      className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {/* 欄位 A: 本月總支出 + MoM 變動 */}
      <HeadlineCard
        label="本月總支出"
        value={current.expense}
        valueClassName="text-rose-400"
        footer={
          <DeltaPill
            delta={expenseDelta}
            // 支出語意：增加=壞（紅）、減少=好（綠）
            invertedTone
          />
        }
      />

      {/* 欄位 B: 本月總收入 */}
      <HeadlineCard
        label="本月總收入"
        value={current.income}
        valueClassName="text-emerald-400"
        footer={
          <p className="text-[11px] text-muted-foreground/70">
            {current.income === 0
              ? "尚未入帳，注意支出全靠存量"
              : "包含薪資 / 補助 / 退稅等"}
          </p>
        }
      />

      {/* 欄位 C: 儲蓄率 */}
      <SavingsRateCard rate={savingsRate} hasIncome={current.income > 0} />
    </section>
  );
}

/* ─────────────────── Card primitives ─────────────────── */

interface HeadlineCardProps {
  label: string;
  value: number;
  valueClassName: string;
  footer: React.ReactNode;
}

function HeadlineCard({ label, value, valueClassName, footer }: HeadlineCardProps) {
  return (
    <Card className="px-4 py-3 ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums tracking-tight",
          valueClassName
        )}
      >
        <AnimatedNumber value={value} />
      </p>
      <div className="mt-1">{footer}</div>
    </Card>
  );
}

function SavingsRateCard({
  rate,
  hasIncome,
}: {
  rate: number | null;
  hasIncome: boolean;
}) {
  // 儲蓄率染色：>= 20% emerald（理財健康基準）/ >= 0 zinc / < 0 rose
  const tone =
    rate === null
      ? "neutral"
      : rate >= 20
        ? "good"
        : rate >= 0
          ? "ok"
          : "bad";
  const valueClass =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-rose-400"
        : "text-zinc-200";

  return (
    <Card className="px-4 py-3 ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          <PiggyBank className="size-3" />
          當月儲蓄率
          <HelpTip ariaLabel="儲蓄率說明">
            💡 儲蓄率 = (總收入 − 總支出) ÷ 總收入。理財建議至少維持
            <strong> 20%</strong>。負值代表本月入不敷出，正在動用存量。
          </HelpTip>
        </span>
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums tracking-tight",
          valueClass
        )}
      >
        {rate === null ? (
          <span className="text-muted-foreground/60">—</span>
        ) : (
          <span data-money>{rate.toFixed(1)}%</span>
        )}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground/70">
        {!hasIncome
          ? "本月尚無收入，無法計算"
          : rate !== null && rate >= 20
            ? "達標 — 維持穩健理財節奏"
            : rate !== null && rate >= 0
              ? "未達 20% 健康基準，可優化"
              : "入不敷出，請檢視浮動開銷"}
      </p>
    </Card>
  );
}

/* ─────────────────── Delta pill ─────────────────── */

interface DeltaInfo {
  /** 變動 % 數值，null = 上月無資料無法比較 */
  pct: number | null;
  /** 純文字版本（含正負號），給輔助說明用 */
  label: string;
}

function computeDelta(current: number, previous: number): DeltaInfo {
  if (previous === 0) {
    return {
      pct: null,
      label: current > 0 ? "上月無資料" : "上月無資料",
    };
  }
  const pct = ((current - previous) / previous) * 100;
  return {
    pct,
    label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
  };
}

function DeltaPill({
  delta,
  invertedTone = false,
}: {
  delta: DeltaInfo;
  /** 支出場景：增加=壞（紅）、減少=好（綠）。預設 false（增加=綠）。 */
  invertedTone?: boolean;
}) {
  if (delta.pct === null) {
    return (
      <p className="text-[11px] text-muted-foreground/70">較上月：尚無資料對比</p>
    );
  }
  const goingUp = delta.pct > 0.05;
  const goingDown = delta.pct < -0.05;
  const Icon = goingUp ? ArrowUp : goingDown ? ArrowDown : Minus;

  // 染色邏輯：invertedTone（支出）↑紅↓綠；正常（收入/儲蓄）↑綠↓紅
  const toneClass = !goingUp && !goingDown
    ? "text-muted-foreground"
    : (goingUp ? invertedTone : !invertedTone)
      ? "text-rose-400"
      : "text-emerald-400";

  return (
    <p
      className={cn(
        "flex items-center gap-1 text-[11px] tabular-nums",
        toneClass
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} />
      <span data-money>較上月 {delta.label}</span>
    </p>
  );
}

/* ─────────────────── Month totals helper ─────────────────── */

function aggregateMonth(
  transactions: TransactionRow[],
  monthDate: Date
): MonthTotals {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.status !== "completed") continue;
    // transfer 兩腿互抵不算「收入/支出」訊號，跟既有 monthlyExpenses 邏輯一致
    if (t.type === "transfer") continue;
    const d = new Date(t.date);
    if (d.getFullYear() !== y || d.getMonth() !== m) continue;
    const amount = num(t.amount);
    if (t.type === "income") income += amount;
    else if (t.type === "expense") expense += amount;
  }
  return { income, expense };
}
