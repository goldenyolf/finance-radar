"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import type { CategoryRow } from "@/lib/categories";
import {
  buildDailyDetail,
  type DailyDetailGroup,
} from "@/lib/daily-spend";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";

interface Props {
  /** "YYYY-MM-DD" 必填 — 父層永遠提供值，無 null 狀態 */
  date: string;
  /** "YYYY-MM-DD" 今天（Taipei）— 由父層產生，避免 SSR / client 時區漂移 */
  today: string;
  /** 使用者按 < / > / 「今天」時觸發 */
  onDateChange: (next: string) => void;
  transactions: TransactionRow[];
  accounts: AccountRow[];
  categories: CategoryRow[];
}

/**
 * 每日分類帳本 — 含日期 navigator (< / >) + 當日花費分組卡片。
 *
 * 兩種顯示狀態：
 *   1) 當天 0 花費 → 🎉 empty state
 *   2) 正常       → 多張 category card
 *
 * 兩種狀態都共用同一條 navigator 列（< 2026/05/26 (二) > 今天）— 使用者
 * 隨時可以用 chevron 切日，不會因為今天沒花費而被困住。
 */
export function DailyDetailSection({
  date,
  today,
  onDateChange,
  transactions,
  accounts,
  categories,
}: Props) {
  const detail = useMemo(
    () => buildDailyDetail(transactions, accounts, categories, date),
    [date, transactions, accounts, categories]
  );

  const isToday = date === today;
  const isFutureLocked = date >= today; // 不允許看未來（仍可手動跳，但 > 鈕擋）

  function goPrev() {
    onDateChange(shiftIsoDay(date, -1));
  }
  function goNext() {
    if (isFutureLocked) return;
    onDateChange(shiftIsoDay(date, 1));
  }
  function goToday() {
    onDateChange(today);
  }

  const totalLabel = detail.groups.reduce((n, g) => n + g.items.length, 0);
  const hasSpend = detail.groups.length > 0;

  return (
    <section aria-label="當日細項花費" className="flex flex-col gap-4">
      {/* Navigator: < 日期 > [今天] | 右側合計 chip */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="前一天"
              onClick={goPrev}
              className="size-8 rounded-full"
            >
              <ChevronLeft className="size-4" />
            </Button>
          </motion.div>

          <span className="flex items-center gap-1.5 min-w-[10rem] justify-center text-sm font-semibold tabular-nums">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            {formatDateLabel(date)}
          </span>

          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="後一天"
              onClick={goNext}
              disabled={isFutureLocked}
              className="size-8 rounded-full disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </Button>
          </motion.div>

          {!isToday && (
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={goToday}
                className="ml-1 h-8 gap-1.5 rounded-full text-xs"
              >
                <RotateCcw className="size-3.5" />
                今天
              </Button>
            </motion.div>
          )}
        </div>

        {hasSpend && (
          <span className="ml-auto flex items-baseline gap-1.5 text-xs text-muted-foreground tabular-nums">
            共 {totalLabel} 筆 · 合計
            <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
              <Money value={detail.total} />
            </span>
          </span>
        )}
      </header>

      {/* Body — empty state 或 N 張分類卡 */}
      {hasSpend ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {detail.groups.map((g) => (
            <CategoryGroupCard key={g.categoryName} group={g} />
          ))}
        </div>
      ) : (
        <Card className="border-emerald-500/20 bg-emerald-500/[0.03]">
          <CardContent className="px-6 py-10 text-center">
            <p className="text-2xl">🎉</p>
            <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              太棒了！這天沒有任何花費支出。
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

/* ─────────────────── 單一分類卡片 ─────────────────── */

function CategoryGroupCard({ group }: { group: DailyDetailGroup }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-baseline justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: group.categoryColor }}
            />
            <span className="truncate font-medium">{group.categoryName}</span>
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              · {group.items.length} 筆
            </span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-rose-600 dark:text-rose-400">
            <Money value={group.total} />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-foreground/[0.06]">
          {group.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{item.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Wallet className="size-3" />
                  <span className="truncate">{item.accountName}</span>
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                <Money value={item.amount} />
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ─────────────────── helpers ─────────────────── */

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

function formatDateLabel(iso: string): string {
  // "2026-05-26" → "2026/05/26 (二)"
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const date = new Date(`${iso}T00:00:00`);
  const weekday = Number.isNaN(date.getTime())
    ? ""
    : ` (${WEEKDAY_ZH[date.getDay()]})`;
  return `${y}/${m}/${d}${weekday}`;
}

/** "2026-05-26" + delta 天 → "2026-05-27"。用 setDate 自動處理跨月跨年 */
function shiftIsoDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
