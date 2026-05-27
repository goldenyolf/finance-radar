import { TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { numW, type WealthSnapshotRow } from "@/lib/wealth";

interface Props {
  /** 最新一筆快照；null = 還沒拍過 → 顯示 dash */
  latest: WealthSnapshotRow | null;
}

/**
 * 頂部三大數據卡：總資產 / 總負債 / 淨資產。
 *
 * 還沒任何快照時三張卡都顯示 "—"，引導使用者去按 Phase 4 的「拍快照」按鈕。
 * 淨資產用 STORED generated column（DB 保證一致），這裡只負責顯示。
 */
export function NetWorthCards({ latest }: Props) {
  const hasData = latest !== null;
  const assets = hasData ? numW(latest.total_assets) : null;
  const liab = hasData ? numW(latest.total_liabilities) : null;
  const net = hasData ? numW(latest.net_worth) : null;
  const positive = net !== null ? net >= 0 : true;

  return (
    <section
      aria-label="淨資產三大數據"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <MetricCard
        label="總資產"
        value={assets}
        tone="positive"
        icon={<TrendingUp className="size-4" />}
      />
      <MetricCard
        label="總負債"
        value={liab}
        tone="danger"
        icon={<TrendingDown className="size-4" />}
      />
      <MetricCard
        label="淨資產 (Net Worth)"
        value={net}
        tone={positive ? "positive" : "danger"}
        icon={<Wallet className="size-4" />}
        big
      />
    </section>
  );
}

type Tone = "positive" | "danger";

interface MetricCardProps {
  label: string;
  value: number | null;
  tone: Tone;
  icon: React.ReactNode;
  big?: boolean;
}

const TONE_VALUE: Record<Tone, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  danger: "text-rose-600 dark:text-rose-400",
};

const TONE_RING: Record<Tone, string> = {
  positive: "ring-emerald-500/25",
  danger: "ring-rose-500/25",
};

const TONE_ACCENT: Record<Tone, string> = {
  positive: "text-emerald-500",
  danger: "text-rose-500",
};

function MetricCard({ label, value, tone, icon, big }: MetricCardProps) {
  return (
    <div
      className={`rounded-xl bg-card px-5 py-4 ring-1 ${TONE_RING[tone]} ${
        big ? "shadow-sm sm:col-span-1" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        <span className={TONE_ACCENT[tone]} aria-hidden>
          {icon}
        </span>
      </div>
      <p
        className={`mt-2 tabular-nums tracking-tight ${TONE_VALUE[tone]} ${
          big ? "text-3xl font-bold" : "text-2xl font-semibold"
        }`}
      >
        {value === null ? (
          <span className="text-muted-foreground/60">—</span>
        ) : (
          <AnimatedNumber value={value} />
        )}
      </p>
    </div>
  );
}
