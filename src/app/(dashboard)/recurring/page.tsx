import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { AddRecurringDialog } from "@/components/recurring/add-recurring-dialog";
import { DeleteRecurringButton } from "@/components/recurring/delete-recurring-button";
import { EditRecurringDialog } from "@/components/recurring/edit-recurring-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import {
  expandToMonthly,
  FREQUENCY_LABEL,
  netMonthlyRecurring,
  num,
  type AccountRow,
  type RecurringRow,
  type UserRow,
} from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function safeList<T>(
  promise: PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  try {
    const { data, error } = await promise;
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

async function loadRecurringPage() {
  const supabase = await createClient();
  const userPromise = (async () => {
    try {
      const { data } = await supabase
        .from("users")
        .select("*")
        .limit(1)
        .maybeSingle();
      return data as UserRow | null;
    } catch {
      return null;
    }
  })();

  const [user, recurring, accounts] = await Promise.all([
    userPromise,
    safeList<RecurringRow>(supabase.from("recurring_payments").select("*")),
    safeList<AccountRow>(supabase.from("accounts").select("*")),
  ]);

  return { user, recurring, accounts };
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function RecurringRowCard({
  row,
  accountName,
  accounts,
}: {
  row: RecurringRow;
  accountName: string;
  accounts: { id: string; name: string }[];
}) {
  const isIncome = row.type === "income";
  const monthly = expandToMonthly(num(row.amount), row.frequency);
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 bg-card p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            isIncome
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          }`}
        >
          {isIncome ? (
            <TrendingUp className="size-4" />
          ) : (
            <TrendingDown className="size-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>{FREQUENCY_LABEL[row.frequency]}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Wallet className="size-3" />
              {accountName}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" />
              下次 {formatDate(row.next_due_date)}
            </span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-right">
        <div>
          <p
            className={`text-sm font-semibold tabular-nums ${
              isIncome ? "text-emerald-600 dark:text-emerald-400" : ""
            }`}
          >
            {isIncome ? "+" : "−"}
            <Money value={num(row.amount)} />
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            月均 <Money value={monthly} />
          </p>
        </div>
        <div className="flex items-center">
          <EditRecurringDialog
            id={row.id}
            initial={{
              title: row.title,
              amount: num(row.amount),
              type: row.type,
              frequency: row.frequency,
              accountId: row.account_id,
              nextDueDate: row.next_due_date,
            }}
            accounts={accounts}
          />
          <DeleteRecurringButton id={row.id} title={row.title} />
        </div>
      </div>
    </li>
  );
}

export default async function RecurringPage() {
  const { user, recurring, accounts } = await loadRecurringPage();

  const accountName = (id: string | null) => {
    if (!id) return "未指定帳戶";
    return accounts.find((a) => a.id === id)?.name ?? "未知帳戶";
  };

  const incomeRows = recurring.filter((r) => r.type === "income");
  const expenseRows = recurring.filter((r) => r.type === "expense");
  const { income, expense, net } = netMonthlyRecurring(recurring);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8 flex flex-col gap-5">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          返回 Dashboard
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Recurring
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              週期性收支設定
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              管理固定的薪水、房貸、訂閱⋯⋯系統會自動將其帶入風險燈號與現金流預測。
            </p>
          </div>
          <AddRecurringDialog
            accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          />
        </div>
      </header>

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="ring-1 ring-emerald-500/30">
          <CardHeader>
            <CardDescription className="text-xs font-medium tracking-wide uppercase">
              每月固定收入
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              <Money value={income} />
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              共 {incomeRows.length} 筆
            </p>
          </CardContent>
        </Card>
        <Card className="ring-1 ring-rose-500/30">
          <CardHeader>
            <CardDescription className="text-xs font-medium tracking-wide uppercase">
              每月固定支出
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              <Money value={expense} />
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              共 {expenseRows.length} 筆
            </p>
          </CardContent>
        </Card>
        <Card
          className={`ring-1 ${net >= 0 ? "ring-emerald-500/30" : "ring-rose-500/30"}`}
        >
          <CardHeader>
            <CardDescription className="text-xs font-medium tracking-wide uppercase">
              每月淨額
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle
              className={`text-2xl font-semibold tabular-nums ${
                net >= 0 ? "text-emerald-600 dark:text-emerald-400" : ""
              }`}
            >
              {net >= 0 ? "+" : ""}
              <Money value={net} />
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {net >= 0 ? "每月自動累積" : "每月需從現金補貼"}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
              <CardTitle className="text-base">固定收入</CardTitle>
            </div>
            <CardDescription>薪水、利息、副業⋯⋯</CardDescription>
          </CardHeader>
          <CardContent>
            {incomeRows.length === 0 ? (
              <EmptyHint text="尚未建立任何固定收入" />
            ) : (
              <ul className="flex flex-col gap-2">
                {incomeRows.map((r) => (
                  <RecurringRowCard
                    key={r.id}
                    row={r}
                    accountName={accountName(r.account_id)}
                    accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />
              <CardTitle className="text-base">固定支出</CardTitle>
            </div>
            <CardDescription>房貸、訂閱、保險⋯⋯</CardDescription>
          </CardHeader>
          <CardContent>
            {expenseRows.length === 0 ? (
              <EmptyHint text="尚未建立任何固定支出" />
            ) : (
              <ul className="flex flex-col gap-2">
                {expenseRows.map((r) => (
                  <RecurringRowCard
                    key={r.id}
                    row={r}
                    accountName={accountName(r.account_id)}
                    accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-foreground/15 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
