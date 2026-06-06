"use client";

/**
 * 月度花費分類「鑽取明細」面板 — 點圓餅扇形 / 列表 row 後從卡片正下方滑入，
 * 並支援「現場分類修正」(per UAT in-place reclassify spec)。
 *
 * 設計要件:
 *   - 「毛玻璃」: bg-card/70 + backdrop-blur-md + ring 一層淡邊
 *   - 「極簡克制」: text-sm 為主、date 用 font-mono 等寬、字色階多層降階
 *   - empty state「本月尚無此項消費」: italic + muted/60
 *
 * In-place reclassify 設計:
 *   - 每筆 transaction row 的 category 變成可點 Select
 *   - Trigger 樣式無邊框 (border-0 bg-transparent)，平時極簡 + 點時 popover
 *   - 改完 → optimistic transition (該 row dim + spinner)，server action 完
 *     成後 router.refresh() → 上層 transactions 重灌 → drilldown 重 filter
 *     → 改到別類的 row 自動「飛出」當前 panel；圓餅 + 預算進度條同步 spring 動畫
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Money } from "@/components/ui/money";
import { updateTransactionCategory } from "@/lib/actions/transactions";
import { buildCategoryLookup, type CategoryRow } from "@/lib/categories";
import { num, type TransactionRow } from "@/lib/dashboard";
import {
  EXPENSE_CATEGORY_COLOR,
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/expense-categories";
import { cn } from "@/lib/utils";

/** 七大支出分類 code 列表 — Select dropdown 選項來源 */
const CATEGORY_CODES = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];

interface Props {
  /** 分類點 + label header 用的當前分類顏色（跟圓餅扇形一致）*/
  color: string;
  /** 顯示用分類中文名 */
  label: string;
  /** 已過濾好的當月該分類 transactions，caller 已 sort DESC by date */
  transactions: TransactionRow[];
  /**
   * 動態分類資料（含 user 自訂的 label / color override）。
   * 用來 render Select dropdown 跟 row 上的 chip — user 改過分類名色後即時反映。
   */
  categories: CategoryRow[];
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
  categories,
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
            <DrilldownRow
              key={tx.id}
              tx={tx}
              categories={categories}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─────────────────── Row + Inline Category Select ─────────────────── */

interface RowProps {
  tx: TransactionRow;
  categories: CategoryRow[];
}

function DrilldownRow({ tx, categories }: RowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const lookup = buildCategoryLookup(categories);
  // 當前 category — DB 端是 ExpenseCategory | null；null 視為 'other'
  const currentCategory: ExpenseCategory = (tx.category ?? "other") as ExpenseCategory;

  function handleChange(next: string) {
    if (!next || next === currentCategory) return;
    startTransition(async () => {
      const result = await updateTransactionCategory(tx.id, next);
      if (!result.ok) {
        toast.error("分類更新失敗", { description: result.error });
        return;
      }
      const newLabel =
        lookup.byCode.get(next as ExpenseCategory)?.name ??
        EXPENSE_CATEGORY_LABEL[next as ExpenseCategory];
      toast.success(`已重新分類為【${newLabel}】`);
      // 觸發 RSC 重抓 → drilldown / pie / 預算條一氣呵成 spring 動畫
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 transition-opacity",
        pending && "pointer-events-none opacity-60"
      )}
    >
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">
        {formatShortDate(tx.date)}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground/90">
        {tx.description ?? (
          <span className="italic text-muted-foreground/50">（無描述）</span>
        )}
      </span>

      {/*
        現場分類選擇器 — 平時極簡無邊框，僅顯示分類點+簡名；hover 浮淡底色
        點開即 Select dropdown。base-ui Select.Value 用 render-function children
        (per memory: 否則 trigger 印 raw value)。
      */}
      <Select
        value={currentCategory}
        onValueChange={(next) => {
          // base-ui Select onValueChange 型別含 null — 收斂後再 forward
          if (typeof next === "string") handleChange(next);
        }}
      >
        <SelectTrigger
          aria-label="變更分類"
          disabled={pending}
          className="h-6 w-auto shrink-0 gap-1 rounded-md border-0 bg-transparent px-1.5 py-0 text-[11px] font-normal text-muted-foreground shadow-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-foreground/15 data-[state=open]:bg-muted/60 data-[state=open]:text-foreground"
        >
          <SelectValue>
            {(v) => {
              const code = (typeof v === "string" && v in EXPENSE_CATEGORY_LABEL
                ? v
                : "other") as ExpenseCategory;
              const dyn = lookup.byCode.get(code);
              const dotColor = dyn?.color ?? EXPENSE_CATEGORY_COLOR[code];
              const name = dyn?.name ?? EXPENSE_CATEGORY_LABEL[code];
              return (
                <span className="flex items-center gap-1.5">
                  {pending ? (
                    <Loader2 className="size-2.5 animate-spin" />
                  ) : (
                    <span
                      aria-hidden
                      className="inline-block size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dotColor }}
                    />
                  )}
                  <span className="truncate">{name}</span>
                </span>
              );
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {CATEGORY_CODES.map((code) => {
            const dyn = lookup.byCode.get(code);
            const dotColor = dyn?.color ?? EXPENSE_CATEGORY_COLOR[code];
            const name = dyn?.name ?? EXPENSE_CATEGORY_LABEL[code];
            return (
              <SelectItem key={code} value={code}>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span>{name}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <span className="shrink-0 text-right text-sm font-medium tabular-nums">
        <Money value={num(tx.amount)} format={formatTwd} />
      </span>
    </li>
  );
}
