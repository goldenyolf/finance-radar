"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Layers,
  PieChart as PieChartIcon,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { ExpensePieChart } from "@/components/dashboard/expense-pie-chart";
import { IncomePieChart } from "@/components/dashboard/income-pie-chart";
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
import type { CategoryRow } from "@/lib/categories";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";
import { aggregateMonthlyByCategory } from "@/lib/expense-categories";
import { aggregateMonthlyByIncomeCategory } from "@/lib/income-categories";
import { cn } from "@/lib/utils";

interface Props {
  transactions: TransactionRow[];
  accounts: AccountRow[];
  /** 統計的目標月份。歷史時光機切過去時傳入；省略時走真實本月。 */
  now?: Date;
  /** 動態 categories（含使用者自訂顏色 / 名稱 / 預算）；省略時走靜態常數。 */
  categories?: CategoryRow[];
}

const ALL = "all";
type CategoryMode = "expense" | "income";

export function MonthCategoryCard({
  transactions,
  accounts,
  now,
  categories,
}: Props) {
  const [selectedAccount, setSelectedAccount] = useState<string>(ALL);
  const [mode, setMode] = useState<CategoryMode>("expense");

  // 帳戶 scope 過濾（兩模式共用）
  const scopedTransactions = useMemo(() => {
    if (selectedAccount === ALL) return transactions;
    return transactions.filter((t) => t.account_id === selectedAccount);
  }, [transactions, selectedAccount]);

  const expenseSlices = useMemo(() => {
    const base = now ?? new Date();
    return aggregateMonthlyByCategory(scopedTransactions, base, categories);
  }, [scopedTransactions, now, categories]);

  const incomeSlices = useMemo(() => {
    const base = now ?? new Date();
    return aggregateMonthlyByIncomeCategory(scopedTransactions, base);
  }, [scopedTransactions, now]);

  const isScoped = selectedAccount !== ALL;
  const scopedAccountName = isScoped
    ? getAccountLabel(
        selectedAccount,
        accounts.find((a) => a.id === selectedAccount)?.name
      )
    : null;

  const cardTitle = mode === "expense" ? "本月花費分類" : "本月收入結構";
  const description =
    mode === "expense"
      ? isScoped
        ? `僅檢視「${scopedAccountName}」的本月支出，依七大類加總。`
        : "依「餐飲 / 育兒 / 孝親 / 居家 / 金融 / 交通 / 其他」七大類加總當月已支出。LINE 機器人記帳會自動分類。"
      : isScoped
        ? `僅檢視「${scopedAccountName}」的本月入帳，依薪資 / 副業 / 配息 / 其他四維度拆解。`
        : "依「主業薪資 / 副業外快 / 投資配息 / 其他流入」四大維度拆解當月實際入帳，多元化越高財務彈性越強。";

  return (
    <section className="mt-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{cardTitle}</CardTitle>
              </div>
              <CardDescription className="mt-1">
                {description}
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

          {/* 🆕 支出 / 收入 segmented control — iOS 風 framer-motion 滑塊 */}
          <div className="mt-4">
            <ModeSegmentedControl mode={mode} onChange={setMode} />
          </div>
        </CardHeader>

        <CardContent>
          {/*
            AnimatePresence mode="wait" — 先完成 exit fade-out 再進場新圖。
            duration 跟 Recharts 500ms 動畫錯開 0.2s 讓 chart 內部 wedge
            旋轉展開能被看見、不被快速 unmount 截斷。
          */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {mode === "expense" ? (
                <ExpensePieChart data={expenseSlices} />
              ) : (
                <IncomePieChart data={incomeSlices} />
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
    </section>
  );
}

/* ─────────────────── Segmented Control ─────────────────── */

/**
 * iOS 風支出/收入切換器。底色 #18181b 暗灰、選中滑塊 #27272a 微亮毛玻璃。
 *
 * 動畫核心：選中項背景用 <motion.div layoutId="activeModeIndicator">，框架
 * 在 active 切換時自動算出兩格之間的 transform 並走 spring 動畫。0.2 秒
 * 內完成 + 落點微微吸附震動 (stiffness=380, damping=30 = iOS 觸感校準值)。
 */
function ModeSegmentedControl({
  mode,
  onChange,
}: {
  mode: CategoryMode;
  onChange: (next: CategoryMode) => void;
}) {
  const tabs: Array<{ value: CategoryMode; icon: typeof TrendingDown; label: string }> = [
    { value: "expense", icon: TrendingDown, label: "💸 支出" },
    { value: "income", icon: TrendingUp, label: "💰 收入" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="支出 / 收入切換"
      className="inline-flex w-fit gap-0.5 rounded-full bg-[#18181b] p-1 ring-1 ring-white/[0.04]"
    >
      {tabs.map((t) => {
        const isActive = mode === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(t.value)}
            className="relative isolate min-w-[5.5rem] rounded-full px-4 py-1.5 text-sm font-medium"
          >
            {/* 滑塊背景 — 只在 active 時 render，靠 layoutId 在兩格之間插值 */}
            {isActive && (
              <motion.span
                layoutId="activeModeIndicator"
                aria-hidden
                className="absolute inset-0 -z-10 rounded-full bg-[#27272a] ring-1 ring-white/[0.06] shadow-sm"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            {/* 文字層 — z-10 浮在滑塊之上；color transition 跟著 motion 同節奏 */}
            <span
              className={cn(
                "relative z-10 transition-colors duration-200",
                isActive ? "text-white" : "text-[#71717a]"
              )}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
