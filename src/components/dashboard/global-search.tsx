"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2Icon, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getAccountLabel } from "@/lib/account-display";
import {
  formatCurrency,
  num,
  type AccountRow,
  type TransactionRow,
} from "@/lib/dashboard";
import {
  EXPENSE_CATEGORY_COLOR,
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/expense-categories";
import { supabase } from "@/lib/supabase";

interface Props {
  accounts: AccountRow[];
}

/** 從 transactions 撈出來的最小欄位集合，給搜尋結果列顯示用。 */
type SearchRow = Pick<
  TransactionRow,
  "id" | "description" | "amount" | "date" | "account_id" | "category" | "type"
>;

const DEBOUNCE_MS = 350;
const LOOKBACK_MONTHS = 12;

function pastYearIsoDate(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth() - LOOKBACK_MONTHS, 1);
  return d.toISOString().slice(0, 10);
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

export function GlobalSearch({ accounts }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stale-guard：多個 keypress 連發時，只 commit 最後一次 query 的結果。
  // 用 ref 避免 closure 抓到舊版 token。
  const reqTokenRef = useRef(0);

  const inputId = useId();

  // Debounce: query → debounced (350ms 停手)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // 依 debounced 觸發查詢
  useEffect(() => {
    if (!debounced) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const token = ++reqTokenRef.current;
    setLoading(true);
    setError(null);

    (async () => {
      const since = pastYearIsoDate(new Date());
      const { data, error: err } = await supabase
        .from("transactions")
        .select("id, description, amount, date, account_id, category, type")
        .ilike("description", `%${debounced}%`)
        .gte("date", since)
        .order("date", { ascending: false })
        .limit(200);

      // 過期回應丟棄
      if (token !== reqTokenRef.current) return;

      if (err) {
        setError(err.message);
        setResults([]);
      } else {
        setResults((data ?? []) as SearchRow[]);
      }
      setLoading(false);
    })();
  }, [debounced]);

  // 重置 dialog 內部狀態（關掉時清乾淨，避免下次開啟看到上次的搜尋）
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setDebounced("");
      setResults([]);
      setError(null);
      setLoading(false);
      reqTokenRef.current++; // 讓所有 in-flight 回應都被視為過期
    }
  }

  // 加總走 reduce — 排除 income / transfer，只算 expense 的金額
  const expenseTotal = useMemo(
    () =>
      results
        .filter((r) => r.type === "expense")
        .reduce((sum, r) => sum + num(r.amount), 0),
    [results]
  );

  const expenseCount = useMemo(
    () => results.filter((r) => r.type === "expense").length,
    [results]
  );

  const hasQuery = debounced.length > 0;
  const showEmpty = hasQuery && !loading && !error && results.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="gap-1.5 rounded-full"
            aria-label="全域搜尋"
          />
        }
      >
        <Search className="size-4" />
        搜尋...
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>全域搜尋</DialogTitle>
          <DialogDescription>
            跨月份搜尋過去 12 個月內的帳目，自動加總所有符合的支出金額。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={inputId}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="輸入關鍵字，例如：尿布、保母、午餐"
              className="h-11 pl-9 text-base"
              autoComplete="off"
              spellCheck={false}
            />
            {loading && (
              <Loader2Icon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {hasQuery && !loading && !error && results.length > 0 && (
            <div className="rounded-lg bg-foreground/[0.04] px-4 py-3 ring-1 ring-foreground/10">
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                彙整
              </p>
              <p className="mt-0.5 text-sm">
                找到 <strong className="tabular-nums">{results.length}</strong>{" "}
                筆紀錄
                {expenseCount !== results.length && (
                  <span className="text-muted-foreground">
                    {" "}（其中 {expenseCount} 筆支出）
                  </span>
                )}
                ，總共花費{" "}
                <strong className="tabular-nums text-rose-600 dark:text-rose-400">
                  {formatCurrency(expenseTotal)}
                </strong>
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.04] px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
              查詢失敗：{error}
            </div>
          )}

          {showEmpty && (
            <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
              找不到包含「{debounced}」的帳目
            </div>
          )}

          {!hasQuery && (
            <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-4 py-10 text-center text-xs text-muted-foreground">
              開始輸入以搜尋過去 12 個月的帳目
            </div>
          )}

          {results.length > 0 && (
            <ul className="-mx-1 flex max-h-[28rem] flex-col gap-0.5 overflow-y-auto pr-1">
              {results.map((r) => (
                <SearchResultRow key={r.id} row={r} accounts={accounts} />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface RowProps {
  row: SearchRow;
  accounts: AccountRow[];
}

function SearchResultRow({ row, accounts }: RowProps) {
  const accName = getAccountLabel(
    row.account_id,
    accounts.find((a) => a.id === row.account_id)?.name
  );
  const categoryKey = (row.category ?? "other") as ExpenseCategory;
  const categoryLabel = EXPENSE_CATEGORY_LABEL[categoryKey] ?? "其他";
  const categoryColor = EXPENSE_CATEGORY_COLOR[categoryKey] ?? "#94A3B8";
  const isExpense = row.type === "expense";
  const sign = isExpense ? "−" : row.type === "income" ? "+" : "";

  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/40">
      <span className="mt-0.5 inline-block w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatDateShort(row.date)}
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {row.description ?? "（無說明）"}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ring-1 ring-foreground/10"
            style={{ color: categoryColor }}
          >
            <span
              aria-hidden
              className="inline-block size-1.5 rounded-full"
              style={{ backgroundColor: categoryColor }}
            />
            {categoryLabel}
          </span>
          <span className="truncate">{accName}</span>
        </p>
      </div>

      <span
        className={`shrink-0 text-sm font-semibold tabular-nums ${
          isExpense
            ? "text-rose-600 dark:text-rose-400"
            : row.type === "income"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-foreground"
        }`}
      >
        {sign}
        {formatCurrency(num(row.amount))}
      </span>
    </li>
  );
}
