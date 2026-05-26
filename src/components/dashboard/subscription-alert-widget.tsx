import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { getAccountLabel } from "@/lib/account-display";
import { formatCurrency, type AccountRow } from "@/lib/dashboard";
import {
  daysUntilBilling,
  type SubscriptionRow,
} from "@/lib/subscriptions";

interface Props {
  subscriptions: SubscriptionRow[];
  accounts: AccountRow[];
}

const URGENT_THRESHOLD_DAYS = 7;

/**
 * 「智慧靜默」訂閱警報 widget — 只在有 ≤7 天即將扣款的訂閱才出現，
 * 否則 `return null` 完全消失，保持首頁乾淨。
 *
 * 視覺嚴重度：
 *   - ≤3 天 → 紅色 (rose)，「最後機會取消」
 *   - 4-7 天 → 橘色 (amber)，「該檢查還要不要續訂」
 *
 * 點整塊跳 /settings 做完整管理。
 */
export function SubscriptionAlertWidget({ subscriptions, accounts }: Props) {
  const now = new Date();
  const urgent = subscriptions
    .map((s) => ({ sub: s, days: daysUntilBilling(s.next_billing_date, now) }))
    .filter((x) => !Number.isNaN(x.days) && x.days <= URGENT_THRESHOLD_DAYS && x.days >= 0)
    .sort((a, b) => a.days - b.days);

  // 智慧靜默：沒有 ≤7 天的訂閱直接消失
  if (urgent.length === 0) return null;

  // 整體嚴重度看最緊張的那筆
  const top = urgent[0];
  const isCritical = top.days <= 3;

  const containerClass = isCritical
    ? "border-rose-500/40 bg-rose-500/[0.06] ring-rose-500/30"
    : "border-amber-500/40 bg-amber-500/[0.06] ring-amber-500/30";
  const iconClass = isCritical
    ? "text-rose-600 dark:text-rose-400"
    : "text-amber-600 dark:text-amber-400";
  const titleClass = isCritical
    ? "text-rose-700 dark:text-rose-300"
    : "text-amber-700 dark:text-amber-300";

  return (
    <Link
      href="/settings"
      aria-label="到設定頁管理訂閱"
      className={`mb-6 block rounded-xl border px-5 py-4 ring-1 transition-colors hover:ring-2 ${containerClass}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${titleClass}`}>
            ⚠️ 訂閱扣款預警
            <span className="ml-2 text-xs font-normal opacity-70">
              · {urgent.length} 筆即將扣款
            </span>
          </p>

          <ul className="mt-2 flex flex-col gap-1.5 text-sm leading-relaxed">
            {urgent.map(({ sub, days }) => {
              const accName = getAccountLabel(
                sub.account_id,
                accounts.find((a) => a.id === sub.account_id)?.name
              );
              const dayLabel =
                days === 0
                  ? "**今天**"
                  : days === 1
                    ? "**明天**"
                    : `${days} 天後`;
              const lineColor =
                days <= 3
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-amber-700 dark:text-amber-300";
              return (
                <li key={sub.id} className={lineColor}>
                  <span className="font-medium">【{sub.name}】</span>
                  將於{" "}
                  <strong className="tabular-nums">
                    {dayLabel.replaceAll("**", "")}
                  </strong>{" "}
                  扣款{" "}
                  <strong className="tabular-nums">
                    {formatCurrency(Number(sub.amount))}
                  </strong>{" "}
                  （{accName}）
                </li>
              );
            })}
          </ul>

          <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium opacity-80">
            點此到設定頁管理訂閱
            <ArrowRight className="size-3.5" />
          </p>
        </div>
      </div>
    </Link>
  );
}
