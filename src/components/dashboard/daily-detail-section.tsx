"use client";

import { useMemo } from "react";
import { CalendarDays, Receipt, Wallet } from "lucide-react";

import { Money } from "@/components/ui/money";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CategoryRow } from "@/lib/categories";
import {
  buildDailyDetail,
  type DailyDetailGroup,
} from "@/lib/daily-spend";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";

interface Props {
  /** "2026-05-26" — null 表示沒任何選中，UI 走「請點上方圖表」hint */
  date: string | null;
  transactions: TransactionRow[];
  accounts: AccountRow[];
  categories: CategoryRow[];
}

/**
 * 鑽取清單：根據 selectedDate 把當天 expense 按 category 分組成卡片。
 *
 * 三種狀態：
 *   1) date = null            → 提示「點上方任一柱查看細項」
 *   2) date 存在但 groups 空 → 「太棒了！這天沒有任何花費」
 *   3) 正常                    → render 多張 category 卡
 *
 * 過濾邏輯 (type=expense, status=completed) 跟 buildDailySpendData 一致 —
 * 圖表跟細項清單看到的「當日總額」永遠對得起來。
 */
export function DailyDetailSection({
  date,
  transactions,
  accounts,
  categories,
}: Props) {
  const detail = useMemo(() => {
    if (!date) return null;
    return buildDailyDetail(transactions, accounts, categories, date);
  }, [date, transactions, accounts, categories]);

  // 狀態 1：沒選日期
  if (!detail) {
    return (
      <Card className="mt-6">
        <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
          <Receipt className="mx-auto mb-3 size-6 opacity-50" />
          點上方任一柱子查看當天細項花費
        </CardContent>
      </Card>
    );
  }

  // 狀態 2：選了日期但當天沒花費
  if (detail.groups.length === 0) {
    return (
      <Card className="mt-6 border-emerald-500/20 bg-emerald-500/[0.03]">
        <CardContent className="px-6 py-10 text-center">
          <p className="text-2xl">🎉</p>
          <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            太棒了！這天沒有任何花費支出。
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateLabel(detail.isoDate)}
          </p>
        </CardContent>
      </Card>
    );
  }

  // 狀態 3：正常 — 顯示總覽 chip + N 張分類卡
  return (
    <section aria-label="當日細項花費" className="mt-6 flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarDays className="size-4 text-muted-foreground" />
          {formatDateLabel(detail.isoDate)}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          ・共 {detail.groups.reduce((n, g) => n + g.items.length, 0)} 筆
        </span>
        <span className="ml-auto text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
          當日合計 <Money value={detail.total} />
        </span>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {detail.groups.map((g) => (
          <CategoryGroupCard key={g.categoryName} group={g} />
        ))}
      </div>
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
