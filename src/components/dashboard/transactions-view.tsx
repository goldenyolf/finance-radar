"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  Banknote,
  CreditCard,
  Download,
  Landmark,
  Loader2Icon,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { TransactionRowActions } from "@/components/dashboard/transaction-row-actions";
import { Button } from "@/components/ui/button";
import {
  DatePickerWithRange,
  type DateRange,
} from "@/components/ui/date-range-picker";
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
  /** SSR 預先抓的最近一批交易紀錄。沒有 query / date range 時直接顯示這份。 */
  initial: TransactionRow[];
  /** 動態 categories — 用來把分類 chip 的顏色 / 名稱換成使用者設定值，
   *  同時驅動「中文分類名 → snake_case code」的搜尋反查。 */
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
  | "project_tag"
>;

const DEBOUNCE_MS = 350;
const QUERY_LIMIT = 200;

/* PostgREST `.or()` 的 reserved chars：留著會打破 filter parser；先 strip。
   `%` 也順手濾掉因為我們在 supabase-js 端手動拼 wildcard。 */
const TERM_DISALLOWED_CHARS_RE = /[,()%]/g;

function sanitizeTerm(t: string): string {
  return t.replace(TERM_DISALLOWED_CHARS_RE, "").trim();
}

/**
 * "老婆 + 陪同醫院" → ["老婆", "陪同醫院"]
 * "尿布" → ["尿布"]
 * "" → []
 *
 * 偵測到 `+` 才走 OR 拆解；否則整串當單一詞（保留中間空白的關聯性）。
 */
function parseSearchTerms(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.includes("+")) {
    return trimmed
      .split("+")
      .map(sanitizeTerm)
      .filter(Boolean);
  }
  const single = sanitizeTerm(trimmed);
  return single ? [single] : [];
}

/**
 * 把使用者輸入的關鍵字（多半是中文 label，如「育兒」「醫療」）反查回
 * transactions.category 欄位實際存的 snake_case code。
 *
 * 兩條來源都查：
 *   1. 動態 categories（使用者自訂 name）
 *   2. 靜態 EXPENSE_CATEGORY_LABEL fallback（保底，避免動態還沒載入時搜不到）
 */
function resolveCategoryCodes(
  term: string,
  lookup: CategoryLookup | null
): string[] {
  const needle = term.toLowerCase();
  const codes = new Set<string>();
  if (lookup) {
    for (const c of lookup.all) {
      if (c.code && c.name.toLowerCase().includes(needle)) codes.add(c.code);
    }
  }
  for (const [code, label] of Object.entries(EXPENSE_CATEGORY_LABEL)) {
    if (label.toLowerCase().includes(needle)) codes.add(code);
  }
  return Array.from(codes);
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/* ─── CSV export helpers ────────────────────────────────────────────
   Excel 友善 CSV：
   - 開頭 BOM (﻿) → Excel 自動把檔案視為 UTF-8，中文不會亂碼
   - 行尾 CRLF → 對齊 RFC 4180，Windows / macOS Excel 一致解析
   - 含 `,` `"` `\n` 的欄位需 double-quote 並把內部 `"` 轉義成 `""`
   數字欄位（金額）出 plain number，讓 Excel 自動視為數值，SUM 不會壞。
*/
const CSV_HEADERS = [
  "交易日期",
  "消費項目描述",
  "記帳分類",
  "扣款水庫",
  "支出金額",
] as const;

function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function buildExportCsv(
  rows: SearchRow[],
  accounts: AccountRow[],
  lookup: CategoryLookup | null
): string {
  const lines: string[] = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    const date = formatDateShort(r.date);
    const desc = r.description ?? "";
    const categoryKey = (r.category ?? "other") as ExpenseCategory;
    const categoryLabel =
      lookup?.byCode.get(categoryKey)?.name ??
      EXPENSE_CATEGORY_LABEL[categoryKey] ??
      "其他";
    const accountName = getAccountLabel(
      r.account_id,
      accounts.find((a) => a.id === r.account_id)?.name
    );
    // expense 出負值、income / transfer 出正值 → 直接整欄 SUM 等於淨流量
    const amt = num(r.amount);
    const signedAmount = r.type === "expense" ? -amt : amt;

    lines.push(
      [
        csvEscape(date),
        csvEscape(desc),
        csvEscape(categoryLabel),
        csvEscape(accountName),
        String(signedAmount),
      ].join(",")
    );
  }
  return "﻿" + lines.join("\r\n");
}

function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 下一個事件迴圈再 revoke — 避免 Safari 偶爾在 click 之前 revoke 拿不到檔案
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function toSearchRow(t: TransactionRow): SearchRow {
  return {
    id: t.id,
    description: t.description,
    amount: t.amount,
    date: t.date,
    account_id: t.account_id,
    category: t.category,
    type: t.type,
    payment_method: t.payment_method ?? null,
    project_tag: t.project_tag ?? null,
  };
}

/**
 * 已套用 date range 的 initial mirror — 沒搜尋字串但有日期區間時走 client-side
 * 過濾即可，避免多打一次 supabase。
 */
function applyRangeToInitial(
  rows: TransactionRow[],
  range: DateRange
): SearchRow[] {
  const from = range.from ?? "";
  const to = range.to ?? "";
  return rows
    .filter((t) => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    })
    .map(toSearchRow);
}

export function TransactionsView({ accounts, initial, categories }: Props) {
  const lookup = useMemo(
    () => (categories ? buildCategoryLookup(categories) : null),
    [categories]
  );

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [range, setRange] = useState<DateRange>({ from: null, to: null });

  /*
    fetched 是 server query 的快照 — sig 紀錄它對應的過濾條件，當前 sig 跟
    fetched.sig 不同就代表「還沒撈完 / 撈過期了」→ loading=true。把
    loading / error / results 都改用 derived 推導，effect 內只有 await 後
    一次 async setState，繞開 react-hooks/set-state-in-effect 警告。
  */
  const [fetched, setFetched] = useState<{
    sig: string;
    data: SearchRow[];
    error: string | null;
  } | null>(null);

  const searchId = useId();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const terms = useMemo(() => parseSearchTerms(debounced), [debounced]);
  const hasRange = Boolean(range.from || range.to);
  const hasQuery = terms.length > 0;
  const hasAnyFilter = hasQuery || hasRange;

  /* 當前過濾條件序列化成穩定 key，作為 fetched 快照對齊的基準。 */
  const fetchSig = useMemo(
    () => JSON.stringify({ terms, from: range.from, to: range.to }),
    [terms, range.from, range.to]
  );

  /*
    Server-side 撈資料 only 在有 keyword 時觸發。「只有日期 / 完全沒過濾」
    都走 client-side derive 用 initial（已是最近 200 筆）filter，避免無意義
    round-trip。effect 內不做 sync setState：cancelled flag 防 race，
    setFetched 只在 await 之後跑。
  */
  useEffect(() => {
    if (!hasQuery) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      let q = supabase
        .from("transactions")
        .select(
          "id, description, amount, date, account_id, category, type, payment_method, project_tag"
        );

      if (range.from) q = q.gte("date", range.from);
      if (range.to) q = q.lte("date", range.to);

      /*
        所有 term 攤平成單一 OR 群組 → 任一字 / 分類命中即收。
        每個 term 都貢獻 description ilike + （若中文 label 命中分類）category in (codes)，
        全部塞進一次 `.or()`（多個 .or() 會被 PostgREST AND 起來，不是我們要的）。
      */
      const allOrs: string[] = [];
      for (const term of terms) {
        allOrs.push(`description.ilike.%${term}%`);
        const codes = resolveCategoryCodes(term, lookup);
        if (codes.length > 0) allOrs.push(`category.in.(${codes.join(",")})`);
      }
      if (allOrs.length > 0) q = q.or(allOrs.join(","));

      const { data, error: err } = await q
        .order("date", { ascending: false })
        .limit(QUERY_LIMIT);

      if (cancelled) return;
      setFetched({
        sig: fetchSig,
        data: (data ?? []) as SearchRow[],
        error: err?.message ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [hasQuery, terms, range.from, range.to, lookup, fetchSig]);

  /* === Derived display state — 不再用 setState 同步推 ============== */
  const results: SearchRow[] = useMemo(() => {
    if (!hasAnyFilter) return initial.map(toSearchRow);
    if (!hasQuery) return applyRangeToInitial(initial, range);
    // 撈完前保留上一筆快照避免閃爍；loading 旗標另外顯示 spinner。
    return fetched?.data ?? [];
  }, [hasAnyFilter, hasQuery, initial, range, fetched]);

  const loading = hasQuery && fetched?.sig !== fetchSig;
  const error =
    hasQuery && fetched?.sig === fetchSig ? fetched?.error ?? null : null;

  const expenseTotal = useMemo(
    () =>
      results
        .filter((r) => r.type === "expense")
        .reduce((sum, r) => sum + num(r.amount), 0),
    [results]
  );

  /* 一鍵匯出當前 results — 不另呼 server，直接吃 derived 後的陣列；確保
     使用者看到什麼就匯出什麼，避免 server / client filter 對不齊的尷尬。 */
  const handleExport = useCallback(() => {
    if (results.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const filename = `MoneyRadar_匯出明細_${today}.csv`;
    const csv = buildExportCsv(results, accounts, lookup);
    downloadBlob(csv, filename, "text/csv;charset=utf-8");
    toast.success("匯出完成", {
      description: `${filename} — 共 ${results.length} 筆`,
    });
  }, [results, accounts, lookup]);
  const expenseCount = useMemo(
    () => results.filter((r) => r.type === "expense").length,
    [results]
  );

  /* 既有 project_tag 清單（去重去空）— 編輯 dialog 的 datalist 自動完成用。
     拿 initial（SSR 最近 200 筆）算就夠了，重大專案大概率近期都動過。 */
  const projectTagSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const t of initial) {
      const tag = t.project_tag?.trim();
      if (tag) seen.add(tag);
    }
    return Array.from(seen).sort();
  }, [initial]);

  /* 摘要顯示用字串 — keyword + 日期都吃進去，讓使用者一眼看到當前疊整條件。 */
  const summaryHint = useMemo(() => {
    const parts: string[] = [];
    if (hasQuery) parts.push(`「${terms.join(" + ")}」`);
    if (hasRange) {
      const f = range.from ?? "起";
      const t = range.to ?? "今";
      parts.push(`${f} ~ ${t}`);
    }
    return parts.join("　•　");
  }, [hasQuery, hasRange, range.from, range.to, terms]);

  return (
    <div className="flex flex-col gap-4">
      {/*
        過濾列：搜尋框 + 日期區間。
        sm 以下垂直疊放（picker 自己往左），sm 以上同列；picker 寬度自適 trigger 內容。
      */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={searchId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例：尿布、午餐；支援多關鍵字如「老婆+醫院」"
            aria-label="搜尋帳目，支援以 + 串接多關鍵字（OR）"
            className="h-11 truncate pr-10 pl-9 text-base"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <Loader2Icon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="flex items-center gap-2 sm:shrink-0">
          <DatePickerWithRange value={range} onChange={setRange} />

          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleExport}
            disabled={results.length === 0}
            aria-label="匯出此搜尋結果為 CSV"
            title={
              results.length === 0
                ? "目前沒有可匯出的紀錄"
                : `匯出 ${results.length} 筆為 CSV`
            }
            className="h-11 gap-1.5 px-3 text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            <Download className="size-4" aria-hidden />
            <span className="hidden sm:inline">匯出此搜尋結果</span>
            <span className="sm:hidden">匯出</span>
          </Button>
        </div>
      </div>

      <p className="-mt-2 hidden text-[11px] text-muted-foreground sm:block">
        多關鍵字以 <span className="font-mono text-foreground/80">+</span> 串接（OR，任一命中即收）；留空 + 不選區間顯示最近 200 筆。
      </p>

      {hasAnyFilter && !loading && !error && results.length > 0 && (
        <div className="rounded-lg bg-foreground/[0.04] px-4 py-3 ring-1 ring-foreground/10">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            搜尋疊整 — {summaryHint}
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
          {hasAnyFilter
            ? `找不到符合「${summaryHint}」的帳目`
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
              projectTagSuggestions={projectTagSuggestions}
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
  projectTagSuggestions?: string[];
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

function TransactionRow({
  row,
  accounts,
  lookup,
  categories,
  projectTagSuggestions,
}: RowProps) {
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
          projectTag={row.project_tag ?? null}
          accounts={accounts}
          categories={categories}
          projectTagSuggestions={projectTagSuggestions}
        />
      </div>
    </li>
  );
}
