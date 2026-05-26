"use client";

import { useMemo, useState } from "react";
import { Layers, PieChart as PieChartIcon, Wallet } from "lucide-react";

import { ExpensePieChart } from "@/components/dashboard/expense-pie-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAccountLabel } from "@/lib/account-display";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";
import { aggregateMonthlyByCategory } from "@/lib/expense-categories";

interface Props {
  transactions: TransactionRow[];
  accounts: AccountRow[];
  /** 統計的目標月份。歷史時光機切過去時傳入；省略時走真實本月。 */
  now?: Date;
}

const ALL = "all";

export function MonthCategoryCard({ transactions, accounts, now }: Props) {
  const [selectedAccount, setSelectedAccount] = useState<string>(ALL);

  // 先 filter 再 aggregate；'all' 走全量、否則只算該帳戶 row。
  // 用 useMemo 避免每次 re-render 都重算（transactions 上百筆時有感）。
  // 月份基準走 props.now（時光機切換時會變），否則 fallback 到當下。
  const slices = useMemo(() => {
    const base = now ?? new Date();
    const scoped =
      selectedAccount === ALL
        ? transactions
        : transactions.filter((t) => t.account_id === selectedAccount);
    return aggregateMonthlyByCategory(scoped, base);
  }, [transactions, selectedAccount, now]);

  const isScoped = selectedAccount !== ALL;
  const scopedAccountName = isScoped
    ? getAccountLabel(
        selectedAccount,
        accounts.find((a) => a.id === selectedAccount)?.name
      )
    : null;

  return (
    <section className="mt-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">本月花費分類</CardTitle>
              </div>
              <CardDescription className="mt-1">
                {isScoped
                  ? `僅檢視「${scopedAccountName}」的本月支出，依七大類加總。`
                  : "依「餐飲 / 育兒 / 孝親 / 居家 / 金融 / 交通 / 其他」七大類加總當月已支出。LINE 機器人記帳會自動分類。"}
              </CardDescription>
            </div>

            {/* 帳戶篩選下拉 — 樣式刻意與右上 AccountSwitcher 對齊 */}
            <Select
              value={selectedAccount}
              onValueChange={(v) => setSelectedAccount(v as string)}
            >
              <SelectTrigger className="h-9 min-w-56 rounded-full border-foreground/15 bg-background pl-3 pr-2 text-sm font-medium shadow-sm">
                <SelectValue>
                  {(v) => {
                    const id = typeof v === "string" ? v : ALL;
                    if (id === ALL) {
                      return (
                        <span className="flex items-center gap-2">
                          <Layers className="size-4 text-muted-foreground" />
                          全部資產總覽
                        </span>
                      );
                    }
                    return (
                      <span className="flex items-center gap-2">
                        <Wallet className="size-4 text-muted-foreground" />
                        {getAccountLabel(
                          id,
                          accounts.find((a) => a.id === id)?.name
                        )}
                      </span>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-64">
                <SelectItem value={ALL}>
                  <span className="flex items-center gap-2">
                    <Layers className="size-4 text-muted-foreground" />
                    全部資產總覽
                  </span>
                </SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-2">
                      <Wallet className="size-4 text-muted-foreground" />
                      {getAccountLabel(a.id, a.name)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {slices.length === 0 ? (
            <div className="grid h-72 w-full place-items-center rounded-lg border border-dashed border-foreground/10 bg-muted/30 text-center text-xs text-muted-foreground">
              {isScoped ? "此帳戶該月份尚無花費紀錄" : "該月份尚無已記帳的花費"}
            </div>
          ) : (
            <ExpensePieChart data={slices} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
