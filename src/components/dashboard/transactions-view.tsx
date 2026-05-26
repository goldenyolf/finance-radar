"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2Icon, Search } from "lucide-react";

import { AnimatedNumber } from "@/components/dashboard/animated-number";
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
import { createClient } from "@/lib/supabase/client";

interface Props {
  accounts: AccountRow[];
  /** SSR 預先抓的最近一批交易紀錄。沒有 query 時直接顯示這份。 */
  initial: TransactionRow[];
}

type SearchRow = Pick<
  TransactionRow,
  "id" | "description" | "amount" | "date" | "account_id" | "category" | "type"
>;

const DEBOUNCE_MS = 350;

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

export function TransactionsView({ accounts, initial }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<SearchRow[]>(() =>
    initial.map((t) => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      account_id: t.account_id,
      category: t.category,
      type: t.type,
    }))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqTokenRef = useRef(0);
  const searchId = useId();

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // 查詢觸發：有 query 走 ilike，沒 query 走「最新 200 筆」
  useEffect(() => {
    const token = ++reqTokenRef.current;
    setLoading(true);
    setError(null);

    (async () => {
      const supabase = createClient();
      let queryBuilder = supabase
        .from("transactions")
        .select(
          "id, description, amount, date, account_id, category, type"
        )
        .order("date", { ascending: false })
        .limit(200);

      if (debounced) {
        queryBuilder = queryBuilder.ilike("description", `%${debounced}%`);
      }

      const { data, error: err } = await queryBuilder;
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

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={searchId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="輸入關鍵字，例如：尿布、保母、午餐（留空顯示最新 200 筆）"
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
            搜尋彙整 — 「{debounced}」
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
              <AnimatedNumber value={expenseTotal} />
            </strong>
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.04] px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          查詢失敗：{error}
        </div>
      )}

      {!loading && !error && results.length === 0 && (
        <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
          {hasQuery
            ? `找不到包含「${debounced}」的帳目`
            : "目前沒有任何帳目"}
        </div>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {results.map((r) => (
            <TransactionRow key={r.id} row={r} accounts={accounts} />
          ))}
        </ul>
      )}
    </div>
  );
}

interface RowProps {
  row: SearchRow;
  accounts: AccountRow[];
}

function TransactionRow({ row, accounts }: RowProps) {
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
      <span className="mt-0.5 inline-block w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatDateShort(row.date)}
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {row.description ?? "（無說明）"}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
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
