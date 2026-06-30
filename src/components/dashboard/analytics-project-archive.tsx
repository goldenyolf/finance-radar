"use client";

import { useMemo } from "react";
import { Archive, Tag } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { getAccountLabel } from "@/lib/account-display";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";
import { num } from "@/lib/dashboard";

interface Props {
  /**
   * 已從主圖剃除的「重大專案」交易（project_tag !== null）。
   * caller 已負責 filter — 這層只負責 group + 視覺呈現。
   */
  archived: TransactionRow[];
  accounts: AccountRow[];
}

interface TagGroup {
  tag: string;
  rows: TransactionRow[];
  total: number;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/**
 * 專案隔離歸檔區 — 全域 switch 切 OFF 時，所有 project_tag IS NOT NULL 的
 * 大額專案明細優雅集中流入；視覺上強制 line-through + opacity-30 表達
 * 「這些錢真的花了，但不污染主圖」。
 *
 * Group by tag，每組顯示小計，給家庭對帳一眼掌握「太太醫療總共花多少 / 新居
 * 家電總共多少」— 比逐筆掃過去更有用。empty state 不渲染 component（caller
 * 端會用 archived.length 判斷要不要 mount）。
 */
export function AnalyticsProjectArchive({ archived, accounts }: Props) {
  const groups = useMemo<TagGroup[]>(() => {
    const map = new Map<string, TransactionRow[]>();
    for (const t of archived) {
      const tag = t.project_tag ?? "未命名專案";
      const arr = map.get(tag) ?? [];
      arr.push(t);
      map.set(tag, arr);
    }
    return Array.from(map.entries())
      .map(([tag, rows]) => {
        const total = rows.reduce((s, r) => {
          const amt = num(r.amount);
          // expense 出負、income/transfer 出正 → 小計反映淨流量
          return s + (r.type === "expense" ? -amt : amt);
        }, 0);
        // 同 group 內依日期遞減
        rows.sort((a, b) => (a.date < b.date ? 1 : -1));
        return { tag, rows, total };
      })
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [archived]);

  if (archived.length === 0) return null;

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  return (
    <motion.div
      key="project-archive"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mt-6"
    >
      <Card className="border-dashed border-foreground/15 bg-foreground/[0.02]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Archive className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base text-muted-foreground">
              專案隔離歸檔區
            </CardTitle>
          </div>
          <CardDescription className="mt-1">
            這些大額專案已從主圖過濾，總計{" "}
            <strong className="tabular-nums text-foreground/70">
              <Money value={Math.abs(grandTotal)} />
            </strong>
            ；不污染日常分類分析，但仍可清楚看到大筆資金去向。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-5">
            <AnimatePresence initial={false}>
              {groups.map((g) => (
                <motion.li
                  key={g.tag}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-1"
                >
                  {/* 標籤組標頭 — 顯示 tag 名 + 小計 */}
                  <div className="flex items-center justify-between gap-2 border-b border-foreground/10 pb-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground">
                      <Tag className="size-3" aria-hidden />
                      {g.tag}
                      <span className="text-[10px] opacity-70">
                        ({g.rows.length} 筆)
                      </span>
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                      {g.total < 0 ? "−" : "+"}
                      <Money value={Math.abs(g.total)} />
                    </span>
                  </div>

                  {/* 每筆明細 — line-through + opacity-30 強化「已剔除」視覺 */}
                  <ul className="flex flex-col gap-0.5 pt-1">
                    {g.rows.map((r) => (
                      <ArchivedRow key={r.id} row={r} accounts={accounts} />
                    ))}
                  </ul>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface RowProps {
  row: TransactionRow;
  accounts: AccountRow[];
}

function ArchivedRow({ row, accounts }: RowProps) {
  const accName = getAccountLabel(
    row.account_id,
    accounts.find((a) => a.id === row.account_id)?.name
  );
  const isExpense = row.type === "expense";
  const sign = isExpense ? "−" : row.type === "income" ? "+" : "";
  const amount = num(row.amount);

  return (
    <li
      /*
        line-through + opacity-30 的雙重壓制 — 視覺上「這筆已被剔除」的訊號
        最強；hover 微提高 opacity 讓使用者要看細節時還是讀得清楚（不至於
        completely unreadable）。
      */
      className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-md px-2 py-1.5 text-muted-foreground opacity-30 transition-opacity hover:opacity-60"
    >
      <span className="w-16 shrink-0 text-[11px] tabular-nums sm:w-20">
        {formatDateShort(row.date)}
      </span>
      <span className="min-w-0 truncate text-sm line-through">
        {row.description ?? "（無說明）"}
        <span className="ml-2 text-[10px] no-underline opacity-80">
          · {accName}
        </span>
      </span>
      <span className="shrink-0 text-sm font-medium tabular-nums line-through">
        {sign}
        <Money value={amount} />
      </span>
    </li>
  );
}
