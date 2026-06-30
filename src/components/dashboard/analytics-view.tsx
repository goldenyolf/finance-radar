"use client";

import { useId, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { AnalyticsDailyTab } from "@/components/dashboard/analytics-daily-tab";
import { AnalyticsMonthlyTab } from "@/components/dashboard/analytics-monthly-tab";
import { AnalyticsProjectArchive } from "@/components/dashboard/analytics-project-archive";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { CategoryRow } from "@/lib/categories";
import type {
  AccountRow,
  RecurringRow,
  TransactionRow,
} from "@/lib/dashboard";

interface Props {
  accounts: AccountRow[];
  transactions: TransactionRow[];
  categories?: CategoryRow[];
  /** 使用者設定的每月儲蓄率目標（%）— 跨月趨勢圖會畫成灰色虛線 */
  targetSavingsRate: number;
  /** recurring_payments — 月度財務彈性「零收入 fallback」計算用 */
  recurring: RecurringRow[];
}

function todayIsoTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * 分析頁 Tab 殼 + 跨 tab 共用狀態。
 *
 * 為什麼 selectedDate + tab 要 lift 到這層：
 *   - 月度 tab 的「當月每日花費透視」chart，點任一柱要跳到單日 tab + 該日明細
 *     → chart 的 onDateSelect 必須能同時 setSelectedDate + setTab("daily")
 *   - 從 daily 切回 monthly，chart 也該 highlight 使用者剛剛看過的那天
 *     → 視覺連續性，不會丟失 context
 *
 * 兩個 tab 各自還是有自己的 local state（monthly 有 monthDate；daily 有 navigator
 * 動作），這層只 own 跨 tab 必須共享的東西。
 *
 * 重大專案隔離（per 0028 + spec）：
 *   - showAll=true (default)：原樣，含全部 transactions 含 project_tag 那些
 *   - showAll=false：把 project_tag IS NOT NULL 從主圖完全剔除，集中到下方
 *     歸檔區。switch lift 在這層是因為 monthly / daily 兩個 tab 的圖表都要
 *     吃同一份 filtered 集合，狀態下放會 desync。
 */
export function AnalyticsView({
  accounts,
  transactions,
  categories,
  targetSavingsRate,
  recurring,
}: Props) {
  const today = useMemo(() => todayIsoTaipei(), []);
  const [tab, setTab] = useState<string>("monthly");
  const [selectedDate, setSelectedDate] = useState<string>(() => today);
  /*
    showAll = true → 主圖維持現狀（含大額專案）
    showAll = false → 主圖剃除 project_tag IS NOT NULL，集中到歸檔區

    spec: switch label 「重大專案隔離模式」預設 ON = showAll=true。
  */
  const [showAll, setShowAll] = useState<boolean>(true);
  const switchId = useId();

  const { mainTransactions, archivedTransactions } = useMemo(() => {
    if (showAll) {
      return {
        mainTransactions: transactions,
        archivedTransactions: [] as TransactionRow[],
      };
    }
    const main: TransactionRow[] = [];
    const archived: TransactionRow[] = [];
    for (const t of transactions) {
      if (t.project_tag != null && t.project_tag !== "") archived.push(t);
      else main.push(t);
    }
    return { mainTransactions: main, archivedTransactions: archived };
  }, [transactions, showAll]);

  function handleDrillDownToDay(iso: string) {
    setSelectedDate(iso);
    setTab("daily");
  }

  return (
    <div className="flex flex-col gap-6">
      {/*
        全域原子開關 — 毛玻璃 card，跟 Tooltip/Popover 同款 zinc-950/95 +
        backdrop-blur 視覺語言。狀態 OFF 時左側盾牌 icon 自動轉成淡色，
        傳達「正在剃除」的視覺語意。
      */}
      <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 shadow-sm backdrop-blur-md sm:px-5 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor={switchId}
            className="flex flex-1 cursor-pointer items-center gap-3 select-none"
          >
            <ShieldCheck
              className={`size-5 shrink-0 transition-colors ${
                showAll ? "text-emerald-500" : "text-muted-foreground/60"
              }`}
              aria-hidden
            />
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold tracking-tight">
                重大專案隔離模式
                <span className="ml-1.5 align-middle text-[10px] font-normal text-muted-foreground">
                  （醫療 / 家電 / 大型轉帳）
                </span>
              </span>
              <span className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={showAll ? "on" : "off"}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.18 }}
                    className="inline-block"
                  >
                    {showAll
                      ? "目前顯示全部資料 — 含大額專案，主圖會被拉歪"
                      : "已剃除大額專案 — 主圖只顯示日常柴米油鹽"}
                  </motion.span>
                </AnimatePresence>
              </span>
            </div>
          </label>
          <Switch
            id={switchId}
            checked={showAll}
            onCheckedChange={setShowAll}
            aria-label="重大專案隔離模式 — ON 顯示全部、OFF 剃除大額專案"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList className="grid w-full max-w-md grid-cols-2 sm:max-w-sm">
          <TabsTrigger value="monthly" className="gap-1.5">
            <span aria-hidden>📅</span>
            月度總覽
          </TabsTrigger>
          <TabsTrigger value="daily" className="gap-1.5">
            <span aria-hidden>🗓️</span>
            單日透視
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monthly">
          <AnalyticsMonthlyTab
            transactions={mainTransactions}
            accounts={accounts}
            categories={categories ?? []}
            selectedDate={selectedDate}
            onDrillDownToDay={handleDrillDownToDay}
            targetSavingsRate={targetSavingsRate}
            recurring={recurring}
          />
        </TabsContent>

        <TabsContent value="daily">
          <AnalyticsDailyTab
            transactions={mainTransactions}
            accounts={accounts}
            categories={categories ?? []}
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            today={today}
          />
        </TabsContent>
      </Tabs>

      {/*
        歸檔區只在 OFF + 有被剔除的資料時 mount；切回 ON 自動 fade-out。
        放 Tabs 外面 = 兩個 tab 都看得到，使用者切 daily 也知道有哪些大筆
        被拉到一邊。
      */}
      <AnimatePresence initial={false}>
        {!showAll && archivedTransactions.length > 0 && (
          <AnalyticsProjectArchive
            key="archive"
            archived={archivedTransactions}
            accounts={accounts}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
