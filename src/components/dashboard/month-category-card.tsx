"use client";

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  PieChart as PieChartIcon,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { CategoryDrilldownPanel } from "@/components/dashboard/category-drilldown-panel";
import { ExpensePieChart } from "@/components/dashboard/expense-pie-chart";
import { IncomePieChart } from "@/components/dashboard/income-pie-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CategoryRow } from "@/lib/categories";
import type { TransactionRow } from "@/lib/dashboard";
import {
  aggregateMonthlyByCategory,
  EXPENSE_CATEGORY_COLOR,
  EXPENSE_CATEGORY_LABEL,
  filterMonthlyExpenses,
  type ExpenseCategory,
} from "@/lib/expense-categories";
import { triggerHaptic } from "@/lib/haptics";
import { aggregateMonthlyByIncomeCategory } from "@/lib/income-categories";
import { cn } from "@/lib/utils";

interface Props {
  transactions: TransactionRow[];
  /** 統計的目標月份。歷史時光機切過去時傳入；省略時走真實本月。 */
  now?: Date;
  /** 動態 categories（含使用者自訂顏色 / 名稱 / 預算）；省略時走靜態常數。 */
  categories?: CategoryRow[];
}

type CategoryMode = "expense" | "income";

/**
 * MonthCategoryCard — 只負責「當前 transactions 的分類拆解」。
 * 帳戶篩選已提升到 AnalyticsView 全頁層級（見 analytics-view.tsx 頂端 slim
 * strip），這裡吃到的 transactions 已按 user 選的帳戶 scope 過。所以拿掉
 * 本卡片內原本的 Select + selectedAccount state，簡化描述文案。
 */
export function MonthCategoryCard({
  transactions,
  now,
  categories,
}: Props) {
  const [mode, setMode] = useState<CategoryMode>("expense");
  // 預設 ON — 圓餅圖首次呈現「真實日常消費」不被系統 / 大額調度污染 (per UAT spec)
  const [excludeOutliers, setExcludeOutliers] = useState<boolean>(true);
  // 圓餅鑽取明細 — 點扇形 / 列表 row toggle；null = 未選 (per UAT drill-down spec)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const expenseSlices = useMemo(() => {
    const base = now ?? new Date();
    return aggregateMonthlyByCategory(transactions, base, categories, {
      excludeOutliers,
    });
  }, [transactions, now, categories, excludeOutliers]);

  const incomeSlices = useMemo(() => {
    const base = now ?? new Date();
    return aggregateMonthlyByIncomeCategory(transactions, base);
  }, [transactions, now]);

  // Drill-down 明細：用 filterMonthlyExpenses 跟 aggregator 走同款過濾鏈
  // （含 excludeOutliers），再依 category 過 + sort date DESC。
  // 確保「pie 顯示的 X 元 = 列表加總」一致性。
  const drilldownTransactions = useMemo(() => {
    if (mode !== "expense" || !selectedCategory) return [];
    const base = now ?? new Date();
    const monthExpenses = filterMonthlyExpenses(transactions, base, {
      excludeOutliers,
    });
    // per review #3：aggregator group key 是 `t.category?.trim() || "other"`
    // （expense-categories.ts:aggregateMonthlyByCategory）。此處 filter 用
    // 同款 normalize，避免空字串 / 純空白的 category 在 pie 落進 "other"
    // bucket 但 drilldown 撈不到 → 「pie 總額 = 明細總額」不變式的違反。
    return monthExpenses
      .filter((t) => (t.category?.trim() || "other") === selectedCategory)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [mode, selectedCategory, transactions, now, excludeOutliers]);

  /*
    切 mode (expense ↔ income) → 清掉鑽取選擇避免殘留。
    改用 handler 直接 setState 而非 useEffect：
      - 消除 react-hooks/set-state-in-effect 警告
      - 語意更貼近「使用者觸發的動作連鎖」而非「side effect」
    帳戶範圍變化不必自己處理 — AnalyticsView 換 transactions ref 會讓
    aggregator 重算，selectedCategory 若不再對應任何 slice，selectedSlice
    自然變 null；drilldown panel AnimatePresence 也會 fade-out。
  */
  const handleModeChange = useCallback((next: CategoryMode) => {
    setMode(next);
    setSelectedCategory(null);
  }, []);

  // 選中的 slice 元資料給 drill-down panel 用 (顏色 / label)
  const selectedSlice = useMemo(() => {
    if (!selectedCategory) return null;
    return expenseSlices.find((s) => s.category === selectedCategory) ?? null;
  }, [selectedCategory, expenseSlices]);

  const cardTitle = mode === "expense" ? "本月花費分類" : "本月收入結構";
  const description =
    mode === "expense"
      ? "依「餐飲 / 育兒 / 孝親 / 居家 / 金融 / 交通 / 其他」七大類加總當月已支出。LINE 機器人記帳會自動分類。"
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

            {/* 帳戶篩選已提升到 AnalyticsView 頂端 slim strip — 此處不再重複。 */}
          </div>

          {/* 🆕 支出 / 收入 segmented control — iOS 風 framer-motion 滑塊 */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ModeSegmentedControl mode={mode} onChange={handleModeChange} />
            {/*
              👁️ 排除大額/系統項目 toggle — 只在 expense 模式顯示（income 不需要）。
              預設 ON：圓餅圖呈現「真實日常消費」不被系統 / 大額調度污染。
              OFF 顯示 raw 數據，給 user「我要看全部」的退路。
            */}
            {mode === "expense" && (
              <OutlierToggle
                excluded={excludeOutliers}
                onChange={setExcludeOutliers}
              />
            )}
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
                <ExpensePieChart
                  data={expenseSlices}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                />
              ) : (
                <IncomePieChart data={incomeSlices} />
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      {/*
        🔍 鑽取明細面板 — 圖卡正下方滑入。
        AnimatePresence + spring：高度 0 ↔ auto + opacity 0 ↔ 1，落點吸附帶
        微 overshoot；overflow-hidden 包外層避免展開時內容溢出。
        只在 expense 模式 + 有 selection 時 render；income 模式或未選一律不出現。
      */}
      <AnimatePresence initial={false}>
        {mode === "expense" && selectedCategory && (
          <motion.div
            key="drilldown"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{
              type: "spring",
              stiffness: 320,
              damping: 32,
              mass: 0.8,
            }}
            className="overflow-hidden"
          >
            <CategoryDrilldownPanel
              /*
                per 0030：selectedCategory 可能是 built-in code 或 UUID。
                selectedSlice 已從 aggregator resolve 過 color/label；
                若 slice 找不到（罕見 race）走 EXPENSE_CATEGORY_LABEL fallback，
                只認 built-in key，UUID 走 other 灰色。
              */
              color={
                selectedSlice?.color ??
                EXPENSE_CATEGORY_COLOR[
                  (selectedCategory in EXPENSE_CATEGORY_COLOR
                    ? selectedCategory
                    : "other") as ExpenseCategory
                ]
              }
              label={
                selectedSlice?.label ??
                EXPENSE_CATEGORY_LABEL[
                  (selectedCategory in EXPENSE_CATEGORY_LABEL
                    ? selectedCategory
                    : "other") as ExpenseCategory
                ]
              }
              transactions={drilldownTransactions}
              categories={categories ?? []}
              onClose={() => setSelectedCategory(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ─────────────────── Outlier 排除 Toggle ─────────────────── */

/**
 * 👁️ 排除大額/系統項目 — 極簡 toggle pill。
 *
 * 設計:
 *   - Apple 風 — 用 emerald 色彩在 ON 時提示「乾淨數據鎖定中」，OFF 時降回
 *     muted 灰色暗示「raw 模式」
 *   - aria-pressed 對應 toggle 語意（不是 checkbox / radio）
 *   - icon 動態切換 Eye <-> EyeOff，強化「在看 / 不在看」的視覺隱喻
 */
function OutlierToggle({
  excluded,
  onChange,
}: {
  excluded: boolean;
  onChange: (next: boolean) => void;
}) {
  const Icon = excluded ? Eye : EyeOff;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={excluded}
      aria-label="排除大額或系統項目"
      onClick={() => onChange(!excluded)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
        excluded
          ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30 hover:bg-emerald-500/15"
          : "bg-muted/40 text-muted-foreground ring-foreground/10 hover:bg-muted/60"
      )}
    >
      <Icon className="size-3.5" />
      <span>排除大額/系統項目</span>
    </button>
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
            onClick={() => {
              if (isActive) return; // 已選中再點不重複觸發
              onChange(t.value);
              // 延遲 200ms 跟 spring 380/30 的落點吸附同步 — 仿 iOS
              // segmented control「滑塊咬住」那瞬間的觸感
              triggerHaptic("select", { delayMs: 200 });
            }}
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
