import Link from "next/link";
import { useState } from "react";
import { Banknote, CreditCard, Landmark, Pencil, Settings, Wallet } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { TransactionRowActions } from "@/components/dashboard/transaction-row-actions";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import type { CategoryRow } from "@/lib/categories";
import {
  formatCurrency,
  num,
  type AccountRow,
  type AccountType,
  type BoardData,
  type BoardDetailItem,
  type DetailCategory,
  type DetailStatus,
} from "@/lib/dashboard";

interface Props {
  data: BoardData;
  /** 全部帳戶清單（跨板塊），給編輯 dialog 的「移動到其他帳戶」下拉用。 */
  allAccounts: AccountRow[];
  /** 動態 categories — 編輯帳目的分類下拉用。 */
  categories?: CategoryRow[];
  /** 編輯排版模式（由 PlateEditableGrid 控制）— 顯示 emoji 編輯筆刷 */
  isEditMode?: boolean;
  /** 編輯模式下使用者選了新 emoji 時觸發 */
  onEmojiChange?: (emoji: string) => void;
}

/** 編輯模式 Popover 提供的 20 個精選 emoji — 涵蓋家庭 / 投資 / 生活情境。 */
const EMOJI_PICKER_OPTIONS = [
  "🏠", "👦", "💰", "🛡️", "📈",
  "☕", "👨‍💼", "🐷", "🎯", "🏥",
  "🎓", "🧓", "🚗", "🍱", "✈️",
  "💎", "🎮", "🎁", "❤️", "📚",
];

const CATEGORY_STYLE: Record<DetailCategory, string> = {
  固定收入:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  固定支出: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20",
  浮動收入:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  浮動支出:
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
  內部轉入:
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-500/20",
  內部轉出:
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-500/20",
};

const STATUS_DOT: Record<DetailStatus, string> = {
  固定排程: "bg-foreground/30",
  已入帳: "bg-emerald-500",
  已扣款: "bg-rose-500",
  預計入帳: "bg-emerald-500/50",
  預計扣款: "bg-rose-500/50",
};

/** account.type → lucide icon。跟 Quick Add Segmented / 明細 badge / Settings chip 同套。 */
const ACCOUNT_TYPE_ICON: Record<AccountType, typeof Banknote> = {
  cash: Banknote,
  credit_card: CreditCard,
  bank: Landmark,
};

function formatDateShort(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function signedFormat(n: number) {
  const abs = Math.abs(n);
  const formatted = formatCurrency(abs);
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `−${formatted}`;
  return formatted;
}

function amountToneClass(item: BoardDetailItem) {
  if (item.signedAmount > 0)
    return "text-emerald-400";
  if (item.signedAmount < 0)
    return "text-rose-600 dark:text-rose-400";
  return "text-foreground";
}

export function BoardCard({ data, allAccounts, categories, isEditMode, onEmojiChange }: Props) {
  const { meta, accounts, metrics, items, hasAccounts, hasRecurringIncome, isUnlinked } = data;
  const remainingPositive = metrics.remaining >= 0;
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  // 資產整合看板 — 板塊所綁定的全部 cash flow accounts 餘額加總。
  // 信用卡 balance 偶為負（欠款），加總會自然抵消，跟「淨資產」語意一致。
  const subAccountTotal = accounts.reduce((s, a) => s + num(a.balance), 0);

  // 預算消耗進度
  // - budget <= 0：無有效預算 → 0%（避免除以零或負值）
  // - 否則 (spent / budget) * 100；> 100% 代表透支
  const consumedRaw =
    metrics.budget > 0 ? (metrics.spent / metrics.budget) * 100 : 0;
  const consumedPct = Math.round(consumedRaw * 10) / 10; // 一位小數
  const consumedBar = Math.min(100, Math.max(0, consumedRaw));
  const consumedTone =
    consumedRaw >= 100
      ? "danger"
      : consumedRaw >= 80
        ? "warning"
        : "safe";
  const indicatorClass =
    consumedTone === "danger"
      ? "[&_[data-slot=progress-indicator]]:bg-rose-500"
      : consumedTone === "warning"
        ? "[&_[data-slot=progress-indicator]]:bg-amber-500"
        : "[&_[data-slot=progress-indicator]]:bg-emerald-500";
  const trackClass =
    consumedTone === "danger"
      ? "[&_[data-slot=progress-track]]:bg-rose-500/15"
      : consumedTone === "warning"
        ? "[&_[data-slot=progress-track]]:bg-amber-500/15"
        : "[&_[data-slot=progress-track]]:bg-emerald-500/15";
  const consumedLabel =
    metrics.budget <= 0
      ? "尚無有效預算"
      : consumedTone === "danger"
        ? `已透支 ${consumedPct.toFixed(1)}%`
        : `已使用 ${consumedPct.toFixed(1)}%`;
  const consumedLabelClass =
    consumedTone === "danger"
      ? "text-rose-600 dark:text-rose-400"
      : consumedTone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  return (
    <Card className="flex flex-col gap-0 overflow-hidden">
      <CardHeader className="gap-2">
        <div className="flex items-start gap-3">
          {/*
            Emoji 區 — 編輯模式時用 Popover 包起來、旁邊浮一個筆刷小 icon。
            非編輯模式維持原本純展示的 <span> 結構不變。
          */}
          {isEditMode ? (
            <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
              <PopoverTrigger
                type="button"
                aria-label="變更板塊 emoji"
                className="relative grid size-10 shrink-0 place-items-center rounded-full bg-muted text-2xl leading-none ring-2 ring-emerald-500/40 transition-shadow hover:ring-emerald-500/60"
              >
                {meta.emoji}
                <span
                  aria-hidden
                  className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-emerald-500 text-white shadow-md"
                >
                  <Pencil className="size-2.5" strokeWidth={3} />
                </span>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" sideOffset={8} className="w-auto p-3">
                <p className="mb-2 text-[11px] font-medium tracking-wider text-zinc-400 uppercase">
                  選一個 Emoji
                </p>
                <div className="grid grid-cols-5 gap-1">
                  {EMOJI_PICKER_OPTIONS.map((e) => {
                    const isCurrent = e === meta.emoji;
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => {
                          onEmojiChange?.(e);
                          setEmojiPickerOpen(false);
                        }}
                        className={`grid size-10 place-items-center rounded-md text-xl transition-colors hover:bg-zinc-800 ${
                          isCurrent ? "bg-emerald-500/10 ring-1 ring-emerald-500/40" : ""
                        }`}
                      >
                        {e}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-2xl leading-none"
            >
              {meta.emoji}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-semibold">
              {meta.name}
            </CardTitle>
            {meta.description && (
              <CardDescription className="mt-0.5 text-xs leading-relaxed">
                {meta.description}
              </CardDescription>
            )}
          </div>
        </div>
        <p className="mb-5 line-clamp-2 text-xs text-muted-foreground">
          {hasAccounts ? (
            <>
              <span className="text-foreground/70">關聯帳戶</span>
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              {accounts.map((a) => a.name).join("、")}
            </>
          ) : isUnlinked ? (
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-amber-600 hover:underline dark:text-amber-400"
            >
              <Settings className="size-3" />
              尚未綁定帳戶，點此到設定頁配置
            </Link>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              關聯帳戶已被刪除
            </span>
          )}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {/*
          資產整合看板 — Phase: Multi-account binding
          上：總餘額 headline (大字)；中：分割線；下：子帳戶兩端對齊列表。
          accounts 全空（未綁定 / 帳戶被刪）時整段不渲染，header 的 chip
          line 已 cover 引導。<Money> 自動套 privacy blur，無需額外處理。
        */}
        {hasAccounts && (
          <section
            aria-label="子帳戶餘額"
            className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                資產總額
              </span>
              <span
                className={`text-2xl font-bold tabular-nums tracking-tight ${
                  subAccountTotal < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-foreground"
                }`}
              >
                <Money value={subAccountTotal} />
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground/70">
              本板塊 {accounts.length} 個帳戶當前餘額加總
            </p>

            <div className="my-2 border-t border-zinc-800/40 pt-2">
              <ul className="flex flex-col">
                {accounts.map((a) => {
                  const Icon = ACCOUNT_TYPE_ICON[a.type] ?? Wallet;
                  const balance = num(a.balance);
                  const isNegative = balance < 0;
                  return (
                    <li
                      key={a.id}
                      className="flex items-center justify-between py-1 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-zinc-500">
                        <Icon className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{a.name}</span>
                      </span>
                      <span
                        className={`shrink-0 tabular-nums ${
                          isNegative
                            ? "text-rose-500 dark:text-rose-400"
                            : "text-zinc-400"
                        }`}
                      >
                        <Money value={balance} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {/* 三個核心數字 — 收緊 25% (gap-4 → gap-3) */}
        <div className="grid grid-cols-1 gap-3">
          <MetricRow
            label="本月可支配預算"
            value={metrics.budget}
            hint={
              hasRecurringIncome
                ? "= 固定收入 − 固定支出"
                : "尚未設定固定收入，預算可能偏低"
            }
            tone="neutral"
          />
          <MetricRow
            label="本月已支出"
            value={metrics.spent}
            hint="當月已完成的浮動支出"
            tone="warning"
          />

          {/*
            收入脈絡內斂小字 — 首頁刻意「克制總覽」不展開細項分類，留給
            /analytics 的雙模式 Pie Chart 做深度拆解。
            metrics.realIncome=0 不渲染（避免空字串視覺垃圾）。
          */}
          {metrics.realIncome > 0 && (
            <div className="-mt-1 flex items-center justify-between px-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span aria-hidden>💰</span>
                本月已進帳總收入
              </span>
              <span className="tabular-nums" data-money>
                <Money value={metrics.realIncome} />
              </span>
            </div>
          )}

          <MetricRow
            label="本月剩餘額度"
            value={metrics.remaining}
            hint={remainingPositive ? "預算內運作中" : "已超出本月預算"}
            tone={remainingPositive ? "positive" : "danger"}
            big
          />

          {/* 預算消耗進度條 */}
          <div className="px-1 pt-1">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                預算消耗
              </span>
              <span
                className={`text-[11px] font-medium tabular-nums ${consumedLabelClass}`}
              >
                {consumedLabel}
              </span>
            </div>
            <Progress
              value={consumedBar}
              aria-label="本月預算消耗"
              className={`${trackClass} ${indicatorClass}`}
            />
          </div>
        </div>

        {/* 分隔 */}
        <div className="border-t border-foreground/10" />

        {/* 明細清單 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              本月明細
            </h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {items.length} 項
            </span>
          </div>
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
              該月份尚無紀錄
            </div>
          ) : (
            <ul className="-mx-1 flex max-h-72 flex-col gap-0.5 overflow-y-auto pr-0.5">
              {items.map((item) => {
                const rawId =
                  item.source === "transaction"
                    ? item.id.slice(2)
                    : null;
                return (
                  <li
                    key={item.id}
                    /*
                      4-column grid：chip | title | amount | actions(reserved)
                      把 actions 從 amount slot 拆出來、固定寬，這樣 recurring（無 actions）
                      跟 transaction（有 actions）兩種列的金額右邊界對齊在同一條線上。
                      之前 actions 跟金額擠在第三欄 auto 寬，導致同條清單裡有/無 actions
                      的列金額位置會跳掉。
                    */
                    className="group grid grid-cols-[auto_1fr_auto_3rem] items-start gap-x-2 gap-y-1 rounded-md px-1.5 py-1.5 hover:bg-muted/50 sm:gap-x-3"
                  >
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ring-1 ${CATEGORY_STYLE[item.category]}`}
                    >
                      {item.category}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        <span className="truncate">{item.title}</span>
                        {item.fulfillmentState === "placeholder" && (
                          <span
                            className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/[0.08] px-1.5 py-0.5 text-[9px] font-normal text-amber-500 ring-1 ring-amber-500/20"
                            title="此筆為週期性扣款的預估佔位，實付後將自動核銷"
                          >
                            ⏳ 待確認
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {item.accountName}
                        {item.source === "transaction" && (
                          <>
                            <span className="mx-1 text-muted-foreground/40">
                              ·
                            </span>
                            {formatDateShort(item.date)}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        className={`text-sm font-semibold tabular-nums ${amountToneClass(item)}`}
                      >
                        <Money value={item.signedAmount} format={signedFormat} />
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span
                          className={`inline-block size-1.5 rounded-full ${STATUS_DOT[item.status]}`}
                        />
                        {item.status}
                      </span>
                    </div>
                    {/* Actions slot 永遠存在（48px 寬），recurring 列空著但保留版位 */}
                    <div className="flex min-h-7 items-center justify-end">
                      {rawId && (
                        <TransactionRowActions
                          transactionId={rawId}
                          title={item.title}
                          amount={item.amount}
                          accountId={item.accountId ?? null}
                          expenseCategory={item.expenseCategory ?? null}
                          isTransfer={item.isTransfer ?? false}
                          transactionType={
                            item.isTransfer
                              ? "transfer"
                              : item.signedAmount > 0
                                ? "income"
                                : "expense"
                          }
                          fulfillmentState={item.fulfillmentState ?? null}
                          accounts={allAccounts}
                          categories={categories}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface MetricRowProps {
  label: string;
  value: number;
  hint: string;
  tone: "neutral" | "warning" | "positive" | "danger";
  big?: boolean;
}

/**
 * big 大字（剩餘額度）才動 tone 配色（positive=emerald / danger=rose），
 * 抓住視覺主焦點；非 big 的次要數字（預算 / 已支出）統一降級成 zinc-200/300
 * 灰白系，降低視覺競爭。對齊 Apple/Linear 「single hero color per card」哲學。
 */
const TONE_VALUE_CLASS: Record<MetricRowProps["tone"], string> = {
  neutral: "text-foreground",
  warning: "text-amber-600 dark:text-amber-400",
  positive: "text-emerald-400",
  danger: "text-rose-600 dark:text-rose-400",
};

const TONE_VALUE_SMALL: Record<MetricRowProps["tone"], string> = {
  neutral: "text-zinc-200",
  warning: "text-zinc-300",
  positive: "text-zinc-200",
  danger: "text-zinc-200",
};

const TONE_RING_CLASS: Record<MetricRowProps["tone"], string> = {
  neutral: "ring-foreground/10",
  warning: "ring-amber-500/20",
  positive: "ring-emerald-500/30",
  danger: "ring-rose-500/30",
};

function MetricRow({ label, value, hint, tone, big }: MetricRowProps) {
  return (
    <div
      className={`rounded-xl bg-card px-4 py-3 ring-1 ${TONE_RING_CLASS[tone]} ${
        big ? "shadow-sm" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        <span
          className={`tabular-nums tracking-tight ${
            big
              ? `text-2xl font-bold ${TONE_VALUE_CLASS[tone]}`
              : `text-lg font-medium ${TONE_VALUE_SMALL[tone]}`
          }`}
        >
          <AnimatedNumber value={value} />
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>
    </div>
  );
}
