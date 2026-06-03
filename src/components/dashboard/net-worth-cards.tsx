import { TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { numW, type WealthSnapshotRow } from "@/lib/wealth";

interface Props {
  /** 最新一筆快照；null = 還沒拍過 → 顯示 dash */
  latest: WealthSnapshotRow | null;
  /** 前一筆快照（次新）— 用來算 MoM 增長率；null = 第一次拍，不顯示增長率 */
  previous?: WealthSnapshotRow | null;
}

/**
 * 頂部三大數據卡：總資產 / 總負債 / 淨資產。
 *
 * 淨資產卡額外顯示 MoM 月增長率：本期 vs 上期，▲ 綠 / ▼ 紅。
 * 分母用 abs(prev) 處理 prev 為負（負債大於資產）的特殊情況，
 * 保證「淨值改善 = +、淨值惡化 = −」的語意正確。
 */
export function NetWorthCards({ latest, previous }: Props) {
  const hasData = latest !== null;
  const assets = hasData ? numW(latest.total_assets) : null;
  const liab = hasData ? numW(latest.total_liabilities) : null;
  const net = hasData ? numW(latest.net_worth) : null;
  const positive = net !== null ? net >= 0 : true;

  const momRate = computeMoM(
    net,
    previous ? numW(previous.net_worth) : null
  );

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
        momRate={momRate}
      />
    </section>
  );
}

/**
 * 月增長率 = (current - prev) / abs(prev) * 100。
 *
 * 為何分母用 abs(prev)：
 *   - prev=−5000 (負債大於資產), current=−3000 → 淨值「改善」了
 *   - 標準公式 ((c-p)/p) 會回 −40%（誤導：看起來變差）
 *   - 用 abs(prev) → 回 +40%（正確：往好的方向走 40%）
 *
 * 邊界：prev null / prev=0 / current null → 回 null（卡片隱藏這行）。
 */
function computeMoM(
  current: number | null,
  prev: number | null
): number | null {
  if (current === null || prev === null) return null;
  if (prev === 0) return null;
  const rate = ((current - prev) / Math.abs(prev)) * 100;
  if (!Number.isFinite(rate)) return null;
  return rate;
}

type Tone = "positive" | "danger";

interface MetricCardProps {
  label: string;
  value: number | null;
  tone: Tone;
  icon: React.ReactNode;
  big?: boolean;
  /** 只給 big 卡用：月增長率（已 % 化），null 代表隱藏 */
  momRate?: number | null;
}

const TONE_VALUE: Record<Tone, string> = {
  positive: "text-emerald-400",
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

function MetricCard({ label, value, tone, icon, big, momRate }: MetricCardProps) {
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
      {big && momRate !== null && momRate !== undefined && (
        <MoMBadge rate={momRate} />
      )}
    </div>
  );
}

/* ─────────────── MoM Badge ─────────────── */

function MoMBadge({ rate }: { rate: number }) {
  const isPositive = rate >= 0;
  const tone = isPositive
    ? "text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
  const arrow = isPositive ? "▲" : "▼";
  const abs = Math.abs(rate);

  return (
    <p
      className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium tabular-nums ${tone}`}
    >
      <span aria-hidden>{arrow}</span>
      {isPositive ? "+" : "−"}
      {abs.toFixed(1)}%
      <span className="font-normal text-muted-foreground">vs 上月</span>
    </p>
  );
}
