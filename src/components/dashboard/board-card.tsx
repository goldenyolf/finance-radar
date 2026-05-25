import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  formatCurrency,
  type BoardData,
  type BoardDetailItem,
  type DetailCategory,
  type DetailStatus,
} from "@/lib/dashboard";

interface Props {
  data: BoardData;
}

const CATEGORY_STYLE: Record<DetailCategory, string> = {
  固定收入:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  固定支出: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20",
  浮動收入:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  浮動支出:
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
  內部轉入:
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-500/20",
  內部轉出:
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-500/20",
};

const STATUS_DOT: Record<DetailStatus, string> = {
  固定排程: "bg-foreground/30",
  已入帳: "bg-emerald-500",
  已扣款: "bg-rose-500",
  預計入帳: "bg-emerald-500/50",
  預計扣款: "bg-rose-500/50",
};

function formatDateShort(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function signedFormat(n: number) {
  const abs = Math.abs(n);
  const formatted = formatCurrency(abs);
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `−${formatted}`;
  return formatted;
}

function amountToneClass(item: BoardDetailItem) {
  if (item.signedAmount > 0)
    return "text-emerald-600 dark:text-emerald-400";
  if (item.signedAmount < 0)
    return "text-rose-600 dark:text-rose-400";
  return "text-foreground";
}

export function BoardCard({ data }: Props) {
  const { def, accounts, metrics, items, hasAccounts, hasRecurringIncome } = data;
  const remainingPositive = metrics.remaining >= 0;

  // 預算消耗進度
  // - budget <= 0：無有效預算 → 0%（避免除以零或負值）
  // - 否則 (spent / budget) * 100；> 100% 代表透支
  const consumedRaw =
    metrics.budget > 0 ? (metrics.spent / metrics.budget) * 100 : 0;
  const consumedPct = Math.round(consumedRaw * 10) / 10; // 一位小數
  const consumedBar = Math.min(100, Math.max(0, consumedRaw));
  const consumedTone =
    consumedRaw >= 100
      ? "danger"
      : consumedRaw >= 80
        ? "warning"
        : "safe";
  const indicatorClass =
    consumedTone === "danger"
      ? "[&_[data-slot=progress-indicator]]:bg-rose-500"
      : consumedTone === "warning"
        ? "[&_[data-slot=progress-indicator]]:bg-amber-500"
        : "[&_[data-slot=progress-indicator]]:bg-emerald-500";
  const trackClass =
    consumedTone === "danger"
      ? "[&_[data-slot=progress-track]]:bg-rose-500/15"
      : consumedTone === "warning"
        ? "[&_[data-slot=progress-track]]:bg-amber-500/15"
        : "[&_[data-slot=progress-track]]:bg-emerald-500/15";
  const consumedLabel =
    metrics.budget <= 0
      ? "尚無有效預算"
      : consumedTone === "danger"
        ? `已透支 ${consumedPct.toFixed(1)}%`
        : `已使用 ${consumedPct.toFixed(1)}%`;
  const consumedLabelClass =
    consumedTone === "danger"
      ? "text-rose-600 dark:text-rose-400"
      : consumedTone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  return (
    <Card className="flex flex-col gap-0 overflow-hidden">
      <CardHeader className="gap-2">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-2xl leading-none"
          >
            {def.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-semibold">
              {def.title}
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs leading-relaxed">
              {def.subtitle}
            </CardDescription>
          </div>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {hasAccounts ? (
            <>
              <span className="text-foreground/70">關聯帳戶</span>
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              {accounts.map((a) => a.name).join("、")}
            </>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              尚未綁定帳戶，請至 Supabase 新增此板塊對應帳戶
            </span>
          )}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* 三個核心數字 */}
        <div className="grid grid-cols-1 gap-2.5">
          <MetricRow
            label="本月可支配預算"
            value={formatCurrency(metrics.budget)}
            hint={
              hasRecurringIncome
                ? "= 固定收入 − 固定支出"
                : "尚未設定固定收入，預算可能偏低"
            }
            tone="neutral"
          />
          <MetricRow
            label="本月已支出"
            value={formatCurrency(metrics.spent)}
            hint="當月已完成的浮動支出"
            tone="warning"
          />
          <MetricRow
            label="本月剩餘額度"
            value={formatCurrency(metrics.remaining)}
            hint={remainingPositive ? "預算內運作中" : "已超出本月預算"}
            tone={remainingPositive ? "positive" : "danger"}
            big
          />

          {/* 預算消耗進度條 */}
          <div className="px-1 pt-1">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                預算消耗
              </span>
              <span
                className={`text-[11px] font-medium tabular-nums ${consumedLabelClass}`}
              >
                {consumedLabel}
              </span>
            </div>
            <Progress
              value={consumedBar}
              aria-label="本月預算消耗"
              className={`${trackClass} ${indicatorClass}`}
            />
          </div>
        </div>

        {/* 分隔 */}
        <div className="border-t border-foreground/10" />

        {/* 明細清單 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              本月明細
            </h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {items.length} 項
            </span>
          </div>
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
              本月尚無紀錄
            </div>
          ) : (
            <ul className="-mx-1 flex max-h-72 flex-col gap-0.5 overflow-y-auto pr-0.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-md px-1.5 py-1.5 hover:bg-muted/50"
                >
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ring-1 ${CATEGORY_STYLE[item.category]}`}
                  >
                    {item.category}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {item.accountName}
                      {item.source === "transaction" && (
                        <>
                          <span className="mx-1 text-muted-foreground/40">
                            ·
                          </span>
                          {formatDateShort(item.date)}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span
                      className={`text-sm font-semibold tabular-nums ${amountToneClass(item)}`}
                    >
                      {signedFormat(item.signedAmount)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span
                        className={`inline-block size-1.5 rounded-full ${STATUS_DOT[item.status]}`}
                      />
                      {item.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface MetricRowProps {
  label: string;
  value: string;
  hint: string;
  tone: "neutral" | "warning" | "positive" | "danger";
  big?: boolean;
}

const TONE_VALUE_CLASS: Record<MetricRowProps["tone"], string> = {
  neutral: "text-foreground",
  warning: "text-amber-600 dark:text-amber-400",
  positive: "text-emerald-600 dark:text-emerald-400",
  danger: "text-rose-600 dark:text-rose-400",
};

const TONE_RING_CLASS: Record<MetricRowProps["tone"], string> = {
  neutral: "ring-foreground/10",
  warning: "ring-amber-500/20",
  positive: "ring-emerald-500/30",
  danger: "ring-rose-500/30",
};

function MetricRow({ label, value, hint, tone, big }: MetricRowProps) {
  return (
    <div
      className={`rounded-xl bg-card px-3 py-2.5 ring-1 ${TONE_RING_CLASS[tone]} ${
        big ? "shadow-sm" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        <span
          className={`tabular-nums tracking-tight ${TONE_VALUE_CLASS[tone]} ${
            big ? "text-2xl font-bold" : "text-xl font-semibold"
          }`}
        >
          {value}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
