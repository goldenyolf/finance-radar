"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Banknote, CreditCard, Landmark, Loader2Icon, Search } from "lucide-react";

import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { TransactionRowActions } from "@/components/dashboard/transaction-row-actions";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { getAccountLabel } from "@/lib/account-display";
import {
  buildCategoryLookup,
  type CategoryLookup,
  type CategoryRow,
} from "@/lib/categories";
import {
  num,
  type AccountRow,
  type PaymentMethod,
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
  /** 動態 categories — 用來把分類 chip 的顏色 / 名稱換成使用者設定值。 */
  categories?: CategoryRow[];
}

type SearchRow = Pick<
  TransactionRow,
  | "id"
  | "description"
  | "amount"
  | "date"
  | "account_id"
  | "category"
  | "type"
  | "payment_method"
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

export function TransactionsView({ accounts, initial, categories }: Props) {
  const lookup = useMemo(
    () => (categories ? buildCategoryLookup(categories) : null),
    [categories]
  );
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
      payment_method: t.payment_method ?? null,
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

  /*
    分兩條路：
    (a) 沒搜尋 → 直接 mirror RSC 的 initial。這樣 router.refresh() 後（例如
        edit dialog 把 expense 改成 income）initial 重撈，這裡也跟上，金額
        正負號 / 顏色就會即時翻轉。原本只 listen [debounced] 不 listen
        initial，導致 UI state 變僵屍。
    (b) 有搜尋 → 走 supabase ilike 即時查詢，跟原本一樣。

    用 [debounced, initial] 雙 deps：RSC re-render 會給新的 initial 物件
    reference → (a) 路徑會重跑同步；搜尋字串變動 → (b) 路徑重查。
  */
  useEffect(() => {
    if (!debounced) {
      setLoading(false);
      setError(null);
      setResults(
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
      return;
    }

    const token = ++reqTokenRef.current;
    setLoading(true);
    setError(null);

    (async () => {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("transactions")
        .select("id, description, amount, date, account_id, category, type, payment_method")
        .ilike("description", `%${debounced}%`)
        .order("date", { ascending: false })
        .limit(200);
      if (token !== reqTokenRef.current) return;

      if (err) {
        setError(err.message);
        setResults([]);
      } else {
        setResults((data ?? []) as SearchRow[]);
      }
      setLoading(false);
    })();
  }, [debounced, initial]);

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
          /* 行動版簡短版；sm+ 才補完整 hint。pr-10 保留右側 loading spinner 空間 */
          placeholder="搜尋帳目"
          aria-label="搜尋帳目（留空顯示最近 200 筆）"
          className="h-11 truncate pr-10 pl-9 text-base"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && (
          <Loader2Icon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      <p className="-mt-2 hidden text-[11px] text-muted-foreground sm:block">
        例：尿布、托育、午餐；留空顯示最近 200 筆。
      </p>

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
            <TransactionRow
              key={r.id}
              row={r}
              accounts={accounts}
              lookup={lookup}
              categories={categories}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface RowProps {
  row: SearchRow;
  accounts: AccountRow[];
  lookup: CategoryLookup | null;
  categories?: CategoryRow[];
}

const PAYMENT_METHOD_META: Record<
  PaymentMethod,
  { label: string; Icon: typeof Banknote }
> = {
  cash: { label: "現金", Icon: Banknote },
  credit_card: { label: "刷卡", Icon: CreditCard },
  transfer: { label: "轉帳", Icon: Landmark },
};

function PaymentMethodBadge({ method }: { method: PaymentMethod | null }) {
  if (!method) return null;
  const { label, Icon } = PAYMENT_METHOD_META[method];
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex size-6 items-center justify-center rounded-full bg-foreground/[0.05] text-muted-foreground ring-1 ring-foreground/10"
    >
      <Icon className="size-3" aria-hidden />
    </span>
  );
}

function TransactionRow({ row, accounts, lookup, categories }: RowProps) {
  const accName = getAccountLabel(
    row.account_id,
    accounts.find((a) => a.id === row.account_id)?.name
  );
  const categoryKey = (row.category ?? "other") as ExpenseCategory;
  const dyn = lookup?.byCode.get(categoryKey);
  const categoryLabel =
    dyn?.name ?? EXPENSE_CATEGORY_LABEL[categoryKey] ?? "其他";
  const categoryColor =
    dyn?.color ?? EXPENSE_CATEGORY_COLOR[categoryKey] ?? "#94A3B8";
  const isExpense = row.type === "expense";
  const sign = isExpense ? "−" : row.type === "income" ? "+" : "";

  return (
    <li
      /*
        4-column grid 跟 BoardCard 同款：date | title+meta | amount | actions(3rem)
        actions slot 永遠保留版位，行動版直接顯示按鈕；md+ 走 hover-reveal
        （由 TransactionRowActions 內部控制）。
      */
      className="group grid grid-cols-[auto_1fr_auto_3rem] items-start gap-x-2 gap-y-1 rounded-md px-2 py-2 hover:bg-muted/40 sm:gap-x-3"
    >
      <span className="mt-0.5 inline-block w-16 shrink-0 text-xs tabular-nums text-muted-foreground sm:w-20">
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

      <div className="flex shrink-0 items-center justify-end gap-1.5">
        <span
          className={`text-sm font-semibold tabular-nums ${
            isExpense
              ? "text-rose-600 dark:text-rose-400"
              : row.type === "income"
                ? "text-emerald-400"
                : "text-foreground"
          }`}
        >
          {sign}
          <Money value={num(row.amount)} />
        </span>
        <PaymentMethodBadge method={row.payment_method ?? null} />
      </div>

      <div className="flex min-h-7 items-center justify-end">
        <TransactionRowActions
          transactionId={row.id}
          title={row.description ?? "（無說明）"}
          amount={num(row.amount)}
          accountId={row.account_id}
          expenseCategory={row.category as ExpenseCategory | null}
          isTransfer={row.type === "transfer"}
          transactionType={row.type as "income" | "expense" | "transfer"}
          accounts={accounts}
          categories={categories}
        />
      </div>
    </li>
  );
}
