"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { AnalyticsDailyTab } from "@/components/dashboard/analytics-daily-tab";
import { AnalyticsMonthlyTab } from "@/components/dashboard/analytics-monthly-tab";
import { AnalyticsProjectArchive } from "@/components/dashboard/analytics-project-archive";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
 * 重大專案隔離（per 0028 + spec）：
 *   - showAll=true (default)：原樣，含全部 transactions
 *   - showAll=false：過濾「project_tag 有值，且 user 在配置面板勾選為『納入過濾』」
 *     的交易，集中流到下方歸檔區。
 *
 * 為什麼是 excludedTags 而非 selectedTags：
 *   存「哪些 tag 不過濾」(excludedTags / deny-list)，新出現的 tag 預設不在
 *   deny-list = 自動納入過濾。如果存正向 allowList 的話，新 tag 預設 = 沒選
 *   = 不過濾 → 跟 spec「預設全選 = 全部 tag 都被過濾」相反。deny-list 才能
 *   做到「使用者打了新 tag 不必再去面板按勾選」。
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
  /* spec: ON = 顯示全部、OFF = 套用過濾。預設 ON。 */
  const [showAll, setShowAll] = useState<boolean>(true);
  /* deny-list 語意：tag 在 set 內 = 不過濾（留在主圖）；不在 set 內 = 過濾掉 */
  const [excludedTags, setExcludedTags] = useState<Set<string>>(
    () => new Set<string>()
  );
  const [filterPanelOpen, setFilterPanelOpen] = useState<boolean>(false);
  const switchId = useId();

  /* 從全部 transactions 撈出去重的 project_tag 清單 — 用全資料而非「當月」，
     讓 user 切月份檢視時 checkbox 不會神秘消失。 */
  const availableTags = useMemo(() => {
    const seen = new Set<string>();
    for (const t of transactions) {
      const tag = t.project_tag?.trim();
      if (tag) seen.add(tag);
    }
    return Array.from(seen).sort();
  }, [transactions]);

  const { mainTransactions, archivedTransactions } = useMemo(() => {
    if (showAll || availableTags.length === 0) {
      return {
        mainTransactions: transactions,
        archivedTransactions: [] as TransactionRow[],
      };
    }
    const main: TransactionRow[] = [];
    const archived: TransactionRow[] = [];
    for (const t of transactions) {
      const tag = t.project_tag?.trim();
      // 標籤為空 → 一定留在主圖
      // 標籤有值但被使用者排除（excludedTags has）→ 留在主圖
      // 標籤有值且未被排除 → 進歸檔區
      if (!tag || excludedTags.has(tag)) main.push(t);
      else archived.push(t);
    }
    return { mainTransactions: main, archivedTransactions: archived };
  }, [transactions, showAll, excludedTags, availableTags.length]);

  function handleDrillDownToDay(iso: string) {
    setSelectedDate(iso);
    setTab("daily");
  }

  function toggleTag(tag: string, nextIncluded: boolean) {
    setExcludedTags((prev) => {
      const next = new Set(prev);
      // nextIncluded=true → checkbox 勾選 = 納入過濾 = 從 deny-list 移除
      if (nextIncluded) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function toggleAll(nextIncluded: boolean) {
    // 全選 = deny-list 清空；全不選 = deny-list 塞所有 tag
    setExcludedTags(nextIncluded ? new Set<string>() : new Set(availableTags));
  }

  // master checkbox 三態邏輯 — base-ui 用兩個 props 分離表達：
  //   indeterminate=true ＋ checked=false（無視覺差）→ Minus icon 顯示部分選
  //   indeterminate=false ＋ checked=true → 全選
  //   indeterminate=false ＋ checked=false → 全不選
  const includedCount = availableTags.filter(
    (t) => !excludedTags.has(t)
  ).length;
  const allIncluded =
    availableTags.length > 0 && includedCount === availableTags.length;
  const partiallyIncluded =
    availableTags.length > 0 &&
    includedCount > 0 &&
    includedCount < availableTags.length;

  const isolationActive = !showAll;
  // 在配置面板的「目前過濾掉幾筆」提示用
  const filteredCount = archivedTransactions.length;

  return (
    <div className="flex flex-col gap-6">
      {/*
        全域原子開關 — 毛玻璃 card，跟 Tooltip/Popover 同款 zinc-950/95 +
        backdrop-blur 視覺語言。狀態 OFF 時左側盾牌 icon 自動轉成淡色。
        正下方掛配置面板 Collapsible，OFF 時自動展開讓使用者調整。
      */}
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] shadow-sm backdrop-blur-md"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
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
                    key={
                      showAll
                        ? "on"
                        : `off-${availableTags.length}-${excludedTags.size}`
                    }
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.18 }}
                    className="inline-block"
                  >
                    {showAll
                      ? "目前顯示全部資料 — 含大額專案，主圖會被拉歪"
                      : filteredCount > 0
                        ? `已剃除 ${filteredCount} 筆大額專案 — 主圖只顯示日常柴米油鹽`
                        : availableTags.length === 0
                          ? "尚未標記任何專案 — 開啟編輯 dialog 替交易打上烙印"
                          : "目前配置全部排除 — 沒有專案被過濾，等同 ON"}
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

        {/*
          配置面板 — Collapsible，OFF 時自動展開比較直覺；ON 時自動收起。
          手動 trigger 也可以開合，給 user 提前配置「我下次打開要過濾哪些」。
        */}
        {availableTags.length > 0 && (
          <Collapsible
            open={filterPanelOpen || isolationActive}
            onOpenChange={setFilterPanelOpen}
          >
            <div className="flex items-center justify-between border-t border-foreground/[0.06] px-4 py-2 sm:px-5">
              <CollapsibleTrigger
                type="button"
                className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground"
              >
                <SlidersHorizontal className="size-3" />
                自訂過濾專案
                <span className="text-[10px] font-normal normal-case tracking-normal opacity-70">
                  {includedCount}/{availableTags.length} 納入
                </span>
                <ChevronDown
                  className="size-3 transition-transform group-data-[panel-open]/collapsible-trigger:rotate-180 group-aria-expanded/collapsible-trigger:rotate-180"
                  aria-hidden
                />
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="px-4 pt-1 pb-4 sm:px-5">
              <div className="flex flex-col gap-2">
                {/* Master checkbox — indeterminate 顯示 minus icon */}
                <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] tracking-wider text-muted-foreground uppercase select-none">
                  <Checkbox
                    checked={allIncluded}
                    indeterminate={partiallyIncluded}
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="全選 / 全不選 納入過濾"
                  />
                  <span>全部納入過濾</span>
                </label>
                <div className="my-1 h-px bg-foreground/10" />

                <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {availableTags.map((tag) => {
                    const included = !excludedTags.has(tag);
                    return (
                      <li key={tag}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-foreground/[0.04]">
                          <Checkbox
                            checked={included}
                            onCheckedChange={(v) => toggleTag(tag, v === true)}
                            aria-label={`${included ? "取消" : ""}納入過濾 ${tag}`}
                          />
                          <span
                            className={
                              included
                                ? "text-foreground"
                                : "text-muted-foreground line-through opacity-60"
                            }
                          >
                            納入過濾：{tag}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </motion.div>

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
          {/*
            wrapper motion.div with layout — 當 mainTransactions 數量變動時，
            内部 cards 自然 reflow（recharts 本身有 animation；外層 layout
            負責伸縮卡片高度的 spring transition）。
          */}
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
          >
            <AnalyticsMonthlyTab
              transactions={mainTransactions}
              accounts={accounts}
              categories={categories ?? []}
              selectedDate={selectedDate}
              onDrillDownToDay={handleDrillDownToDay}
              targetSavingsRate={targetSavingsRate}
              recurring={recurring}
            />
          </motion.div>
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
        {isolationActive && archivedTransactions.length > 0 && (
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
