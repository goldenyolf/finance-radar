"use client";

import { useCallback, useId, useMemo, useState } from "react";
import {
  ChevronDown,
  Layers,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getAccountLabel } from "@/lib/account-display";
import type { CategoryRow } from "@/lib/categories";
import type {
  AccountRow,
  RecurringRow,
  TransactionRow,
} from "@/lib/dashboard";

const ALL_ACCOUNTS = "__all_accounts__";

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
 * 為什麼 selectedDate + tab 要 lift 到這層：見舊版註解；不重複。
 *
 * 特定專案隔離（per 0028 + 翻 spec 語意）：
 *   - isolate=false (default)：顯示全部，slim 條收起，歸檔區不渲染
 *   - isolate=true：把「project_tag 有值且使用者勾選為納入過濾」的交易剃除
 *     到下方歸檔區
 *
 * 顯示策略 — 為避免進畫面就被一張大卡片喧賓奪主:
 *   1) 沒任何被打 tag 的交易 → 整塊回 null（沒東西可隔離，不佔位）
 *   2) 有 tag 但 isolate=false → slim 單行條，pad 很小，font 很小，
 *      只有 icon + 名字 + 副標 + switch
 *   3) isolate=true → 自動展開配置面板，showcase 過濾結果
 *
 * 為什麼是 excludedTags 而非 selectedTags：
 *   存「哪些 tag 不過濾」(deny-list)，新出現的 tag 預設不在 deny-list =
 *   自動納入過濾。如果存正向 allow-list，新 tag 預設 = 沒選 = 不過濾，
 *   跟使用者打了新 tag 就「自動進歸檔」的直覺相反。
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
  /* 全域帳戶篩選 — 從 MonthCategoryCard 提升上來，讓整頁的月度大字 / 圓餅 /
     Sankey / 財務彈性 / 趨勢等全部圖表都跟著這個帳戶 scope 走。 */
  const [selectedAccount, setSelectedAccount] =
    useState<string>(ALL_ACCOUNTS);
  /* isolate=false (default) → 顯示全部；isolate=true → 啟用隔離過濾 */
  const [isolate, setIsolate] = useState<boolean>(false);
  /* deny-list 語意：tag 在 set 內 = 不過濾（留在主圖）；不在 set 內 = 過濾掉 */
  const [excludedTags, setExcludedTags] = useState<Set<string>>(
    () => new Set<string>()
  );
  /*
    per review #13：先前 open={filterPanelOpen || isolate} 讓 isolate=true 時
    user 按 CollapsibleTrigger 收合永遠沒反應（onOpenChange 設 false，但 OR gate
    立刻把 open 拉回 true）。改成：panelOpen 完全由 user 控制；isolate 由 OFF→ON
    透過 handleIsolateChange 主動 sync 一次面板狀態，之後 user 可自由開合。
  */
  const [panelOpen, setPanelOpen] = useState<boolean>(false);
  const switchId = useId();

  const handleIsolateChange = useCallback((next: boolean) => {
    setIsolate(next);
    // toggle 隔離時面板狀態跟著切：ON 自動展開（讓 user 看到過濾對象）；OFF 自動收起。
    // user 之後仍可點 chevron 手動開合，不會被強制拉回。
    setPanelOpen(next);
  }, []);

  /*
    (1) 先套帳戶過濾 — 全站的下游計算都吃這份 accountScopedTransactions，
    不必每張圖各自維護 selectedAccount。避免下面 project_tag 清單也被別家帳戶
    污染（切某帳戶時就只看該帳戶的專案）。
  */
  const accountScopedTransactions = useMemo(() => {
    if (selectedAccount === ALL_ACCOUNTS) return transactions;
    return transactions.filter((t) => t.account_id === selectedAccount);
  }, [transactions, selectedAccount]);

  /* (2) 從 account-scoped transactions 撈去重的 project_tag —
        切帳戶時可用 tag 清單自動跟著窄化。 */
  const availableTags = useMemo(() => {
    const seen = new Set<string>();
    for (const t of accountScopedTransactions) {
      const tag = t.project_tag?.trim();
      if (tag) seen.add(tag);
    }
    return Array.from(seen).sort();
  }, [accountScopedTransactions]);

  const hasTags = availableTags.length > 0;

  /* (3) 再套隔離過濾。account 已經在 (1) 收窄了，這裡只負責 tag 拆解。 */
  const { mainTransactions, archivedTransactions } = useMemo(() => {
    if (!isolate || !hasTags) {
      return {
        mainTransactions: accountScopedTransactions,
        archivedTransactions: [] as TransactionRow[],
      };
    }
    const main: TransactionRow[] = [];
    const archived: TransactionRow[] = [];
    for (const t of accountScopedTransactions) {
      const tag = t.project_tag?.trim();
      // 無 tag → 留主圖
      // 有 tag 但被使用者「不納入過濾」(deny-list) → 留主圖
      // 有 tag 且未被排除 → 進歸檔區
      if (!tag || excludedTags.has(tag)) main.push(t);
      else archived.push(t);
    }
    return { mainTransactions: main, archivedTransactions: archived };
  }, [accountScopedTransactions, isolate, excludedTags, hasTags]);

  const scopedAccountName =
    selectedAccount === ALL_ACCOUNTS
      ? null
      : getAccountLabel(
          selectedAccount,
          accounts.find((a) => a.id === selectedAccount)?.name
        );

  function handleDrillDownToDay(iso: string) {
    setSelectedDate(iso);
    setTab("daily");
  }

  function toggleTag(tag: string, nextIncluded: boolean) {
    setExcludedTags((prev) => {
      const next = new Set(prev);
      if (nextIncluded) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function toggleAll(nextIncluded: boolean) {
    setExcludedTags(nextIncluded ? new Set<string>() : new Set(availableTags));
  }

  // master checkbox 三態邏輯（base-ui 用 indeterminate prop 分離）
  const includedCount = availableTags.filter(
    (t) => !excludedTags.has(t)
  ).length;
  const allIncluded = hasTags && includedCount === availableTags.length;
  const partiallyIncluded =
    hasTags && includedCount > 0 && includedCount < availableTags.length;

  const filteredCount = archivedTransactions.length;

  return (
    <div className="flex flex-col gap-6">
      {/*
        全頁帳戶篩選 — 放在最上方，讓「我這個月在這個帳戶花多少 / 收多少」
        一眼就能切到。
        per Emma persona review E-A1.1：單一帳戶時不再完全隱藏，改顯 disabled
        教學態 strip，讓新使用者知道「這功能存在，只是還沒觸發條件」；避免
        「空 seed 帳號進來 → 頁面看不到帳戶篩選 → 以為沒此功能」的困惑。
      */}
      {accounts.length <= 1 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-foreground/[0.07] bg-foreground/[0.015] px-3 py-2 text-muted-foreground/60 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Layers className="size-4 shrink-0" aria-hidden />
            <span className="text-xs font-medium tracking-tight">
              帳戶檢視範圍
            </span>
            <span className="truncate text-[11px]">
              新增第二個帳戶後可切換單一帳戶檢視
            </span>
          </div>
        </div>
      )}
      {accounts.length > 1 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-foreground/[0.07] bg-foreground/[0.015] px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {selectedAccount === ALL_ACCOUNTS ? (
              <Layers
                className="size-4 shrink-0 text-muted-foreground/60"
                aria-hidden
              />
            ) : (
              <Wallet
                className="size-4 shrink-0 text-emerald-500"
                aria-hidden
              />
            )}
            <span className="text-xs font-medium tracking-tight">
              帳戶檢視範圍
            </span>
            <span className="truncate text-[11px] text-muted-foreground/80">
              {selectedAccount === ALL_ACCOUNTS
                ? `所有 ${accounts.length} 個帳戶合計`
                : `僅檢視「${scopedAccountName}」的本月收支`}
            </span>
          </div>
          <Select
            value={selectedAccount}
            onValueChange={(v) => setSelectedAccount(v as string)}
          >
            <SelectTrigger className="h-9 min-w-44 rounded-full border-foreground/15 bg-background pl-3 pr-2 text-sm font-medium shadow-sm">
              <SelectValue>
                {(v) => {
                  const id = typeof v === "string" ? v : ALL_ACCOUNTS;
                  if (id === ALL_ACCOUNTS) {
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
            <SelectContent className="min-w-56">
              <SelectItem value={ALL_ACCOUNTS}>
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
      )}

      {/*
        Slim 隔離條 — isolate=true 時 Collapsible 自動展開配置。
        per Emma persona review E-A2.1：沒 tag 也不完全隱藏，改顯 disabled
        教學態，讓 user 看到功能存在 + 知道怎麼觸發。
      */}
      {!hasTags && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-foreground/[0.07] bg-foreground/[0.015] px-3 py-2 text-muted-foreground/60 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            <span className="text-xs font-medium tracking-tight">
              特定專案隔離模式
            </span>
            <span className="truncate text-[11px]">
              幫某筆大額交易打上專案標籤（例：太太醫療、新居家電）後可啟用
            </span>
          </div>
        </div>
      )}
      {hasTags && (
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="rounded-lg border border-foreground/[0.07] bg-foreground/[0.015]"
        >
          <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4">
            <label
              htmlFor={switchId}
              className="flex flex-1 cursor-pointer items-center gap-2.5 select-none"
            >
              <ShieldCheck
                className={`size-4 shrink-0 transition-colors ${
                  isolate ? "text-emerald-500" : "text-muted-foreground/50"
                }`}
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="text-xs font-medium tracking-tight">
                  特定專案隔離模式
                </span>
                <span className="truncate text-[11px] text-muted-foreground/80">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={
                        isolate
                          ? `on-${filteredCount}-${excludedTags.size}`
                          : "off"
                      }
                      initial={{ opacity: 0, y: 2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -2 }}
                      transition={{ duration: 0.18 }}
                      className="inline-block"
                    >
                      {!isolate
                        ? `${availableTags.length} 個專案可選 — 點開以剃除大額`
                        : filteredCount > 0
                          ? `已剃除 ${filteredCount} 筆 — 主圖只剩日常`
                          : "全部排除中 — 等同未啟用"}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </div>
            </label>
            <Switch
              id={switchId}
              checked={isolate}
              onCheckedChange={handleIsolateChange}
              aria-label="特定專案隔離模式 — ON 啟用隔離、OFF 顯示全部"
            />
          </div>

          {/*
            配置面板 — isolate=true 自動展開，OFF 時收起；user 也可手動開合
            想「預先配置下次要過濾哪些」。
          */}
          <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
            <div className="flex items-center justify-between border-t border-foreground/[0.05] px-3 py-1.5 sm:px-4">
              <CollapsibleTrigger
                type="button"
                className="flex items-center gap-1.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground"
              >
                <SlidersHorizontal className="size-2.5" />
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

            <CollapsibleContent className="px-3 pt-1 pb-3 sm:px-4">
              <div className="flex flex-col gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-[10px] tracking-wider text-muted-foreground uppercase select-none">
                  <Checkbox
                    checked={allIncluded}
                    indeterminate={partiallyIncluded}
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="全選 / 全不選 納入過濾"
                  />
                  <span>全部納入過濾</span>
                </label>
                <div className="my-0.5 h-px bg-foreground/[0.07]" />

                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
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
        </motion.div>
      )}

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
        歸檔區只在 isolate=true + 有被剔除的資料時 mount；切回 OFF 自動 fade-out。
        放 Tabs 外面 = 兩個 tab 都看得到，使用者切 daily 也知道有哪些大筆被拉到一邊。
      */}
      <AnimatePresence initial={false}>
        {isolate && archivedTransactions.length > 0 && (
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
