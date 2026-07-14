import { ScrollText } from "lucide-react";

import { CsvImportZone } from "@/components/dashboard/csv-import-zone";
import { PageTransition } from "@/components/dashboard/page-transition";
import { TransactionsView } from "@/components/dashboard/transactions-view";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";
import { loadCategories } from "@/lib/load-categories";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * 明細頁只需要 accounts + 最近 200 筆 transactions，不必走 loadDashboard()
 * 全量抓 assets/debts/recurring/user。排序 + 取前 200 交給 DB 端
 * `order(date desc).limit(200)`（配 0032 索引免全表 scan），結果與先前
 * client-side sort+slice 完全等價，TransactionsView 仍假設 initial 是
 * date DESC 的最近 200 筆。materialize RPC 保留 —— 直接進 /transactions
 * 的使用者也要看到本月剛落地的週期性條目。
 */
async function loadTransactionsPage(): Promise<{
  accounts: AccountRow[];
  transactions: TransactionRow[];
}> {
  const supabase = await createClient();

  const [, accountsRes, transactionsRes] = await Promise.all([
    supabase.rpc("materialize_due_recurrings").then(
      () => null,
      () => null // RPC 不可用 → 安靜降級，不擋載入
    ),
    supabase.from("accounts").select("*"),
    supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
      .limit(200),
  ]);

  return {
    accounts: (accountsRes.data as AccountRow[] | null) ?? [],
    transactions: (transactionsRes.data as TransactionRow[] | null) ?? [],
  };
}

export default async function TransactionsPage() {
  const [{ accounts, transactions: sorted }, categories] = await Promise.all([
    loadTransactionsPage(),
    loadCategories(),
  ]);

  return (
    <PageTransition>
    <main className="mx-auto w-full max-w-4xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
      <header className="mb-8">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Transactions
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          <ScrollText className="size-7 text-muted-foreground" />
          歷史明細
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          預設顯示最近 200 筆紀錄；輸入關鍵字可跨月份模糊搜尋並自動加總符合的支出。
        </p>
      </header>

      {/*
        🆕 CSV 智慧匯入區 — 信用卡明細拖檔即解析 + dedup + 預覽 dialog。
        放 TransactionsView 上方因為使用者匯入流程 = 「拖檔 → 確認 → 結果
        在下方列表立刻可見」，動作 / 結果同一視野最直覺。
      */}
      <CsvImportZone accounts={accounts} categories={categories} />

      <TransactionsView
        accounts={accounts}
        initial={sorted}
        categories={categories}
      />
    </main>
    </PageTransition>
  );
}
