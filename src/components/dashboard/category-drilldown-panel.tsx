"use client";

/**
 * 月度花費分類「鑽取明細」面板 — 點圓餅扇形 / 列表 row 後從卡片正下方滑入。
 *
 * 為什麼是獨立檔:
 *   - 純展示 component，input 只有 transactions + meta；caller (MonthCategoryCard)
 *     負責 selectedCategory state + filter，這層只負責「漂亮顯示」
 *   - 動畫殼（AnimatePresence + motion.div spring）放在 caller，這裡只管內容；
 *     拆乾淨後 caller 可以自由換 AnimatePresence mode、key 策略等
 *
 * 視覺要件 (per UAT spec):
 *   - 「毛玻璃」: bg-card/70 + backdrop-blur-md + ring 一層淡邊
 *   - 「極簡克制」: text-sm 為主、date 用 font-mono 等寬、字色階多層降階
 *   - empty state「本月尚無此項消費」: italic + muted/60
 */

import { X } from "lucide-react";

import { Money } from "@/components/ui/money";
import { num, type TransactionRow } from "@/lib/dashboard";

interface Props {
  /** 分類 emoji/icon 用的顏色點（跟圓餅扇形顏色一致）*/
  color: string;
  /** 顯示用分類中文名 */
  label: string;
  /** 已過濾好的當月該分類 transactions，預期 caller 已 sort DESC by date */
  transactions: TransactionRow[];
  onClose: () => void;
}

function formatTwd(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** "2026-06-07" → "06/07" — drill-down 顯示密度高、不需要年份 */
function formatShortDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

export function CategoryDrilldownPanel({
  color,
  label,
  transactions,
  onClose,
}: Props) {
  const total = transactions.reduce((s, t) => s + num(t.amount), 0);
  const count = transactions.length;
  const isEmpty = count === 0;

  return (
    <div className="rounded-xl bg-card/70 p-4 ring-1 ring-foreground/10 supports-backdrop-filter:backdrop-blur-md">
      {/* Header — 分類點 + label + 筆數/總額 meta + 右上 X */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="inline-block size-2.5 shrink-0 rounded-full ring-2 ring-background"
            style={{ backgroundColor: color }}
          />
          <h3 className="truncate text-sm font-medium">{label}</h3>
          {!isEmpty && (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {count} 筆 ·{" "}
              <span className="font-medium text-foreground/80">
                <Money value={total} format={formatTwd} />
              </span>
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="關閉鑽取面板"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {isEmpty ? (
        <p className="py-6 text-center text-xs italic text-muted-foreground/60">
          本月尚無此項消費
        </p>
      ) : (
        <ul className="-mx-1 flex max-h-72 flex-col gap-0.5 overflow-y-auto pr-1 text-sm">
          {transactions.map((tx) => (
            <li
              key={tx.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40"
            >
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">
                {formatShortDate(tx.date)}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground/90">
                {tx.description ?? (
                  <span className="italic text-muted-foreground/50">
                    （無描述）
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right text-sm font-medium tabular-nums">
                <Money value={num(tx.amount)} format={formatTwd} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
