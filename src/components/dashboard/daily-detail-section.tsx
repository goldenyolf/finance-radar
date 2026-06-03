"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import type { CategoryRow } from "@/lib/categories";
import {
  buildDailyDetail,
  computeDailyBaseline,
  type DailyDetailGroup,
  type DailyDetailItem,
} from "@/lib/daily-spend";
import type { AccountRow, TransactionRow } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

/** 大額預付判定門檻：> dailyBaseline × ANOMALY_MULTIPLIER → 觸發「跨月分攤」hint */
const ANOMALY_MULTIPLIER = 3;

interface Props {
  /** "YYYY-MM-DD" 必填 — 父層永遠提供值，無 null 狀態 */
  date: string;
  /** "YYYY-MM-DD" 今天（Taipei）— 由父層產生，避免 SSR / client 時區漂移 */
  today: string;
  /** 使用者按 < / > / 「今天」時觸發 */
  onDateChange: (next: string) => void;
  transactions: TransactionRow[];
  accounts: AccountRow[];
  categories: CategoryRow[];
}

/**
 * 每日分類帳本 — 含日期 navigator (< / >) + 當日花費分組卡片。
 *
 * 兩種顯示狀態：
 *   1) 當天 0 花費 → 🎉 empty state
 *   2) 正常       → 多張 category card
 *
 * 兩種狀態都共用同一條 navigator 列（< 2026/05/26 (二) > 今天）— 使用者
 * 隨時可以用 chevron 切日，不會因為今天沒花費而被困住。
 */
export function DailyDetailSection({
  date,
  today,
  onDateChange,
  transactions,
  accounts,
  categories,
}: Props) {
  const detail = useMemo(
    () => buildDailyDetail(transactions, accounts, categories, date),
    [date, transactions, accounts, categories]
  );

  // 月預算 baseline 跟著選中日期所在月走（不是 always 當月）— 切過去歷史月份
  // 看當時 baseline 才合理，避免「6 月看 5 月的單日是否爆表」用錯基準。
  const dailyBaseline = useMemo(() => {
    const ref = new Date(`${date}T00:00:00`);
    if (Number.isNaN(ref.getTime())) return 0;
    return computeDailyBaseline(categories, ref);
  }, [categories, date]);

  // 時間軸用：把所有 group 攤平後依 createdAt 由早到晚排
  const timelineItems = useMemo(() => {
    const flat = detail.groups.flatMap((g) =>
      g.items.map((it) => ({
        ...it,
        categoryName: g.categoryName,
        categoryColor: g.categoryColor,
      }))
    );
    return flat.sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
    );
  }, [detail]);

  const isToday = date === today;
  const isFutureLocked = date >= today; // 不允許看未來（仍可手動跳，但 > 鈕擋）

  function goPrev() {
    onDateChange(shiftIsoDay(date, -1));
  }
  function goNext() {
    if (isFutureLocked) return;
    onDateChange(shiftIsoDay(date, 1));
  }
  function goToday() {
    onDateChange(today);
  }

  const totalLabel = detail.groups.reduce((n, g) => n + g.items.length, 0);
  const hasSpend = detail.groups.length > 0;

  return (
    <section aria-label="當日細項花費" className="flex flex-col gap-4">
      {/* Navigator: < 日期 > [今天] — 右側合計 chip 已移到下方 Hero 大字 */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="前一天"
              onClick={goPrev}
              className="size-8 rounded-full"
            >
              <ChevronLeft className="size-4" />
            </Button>
          </motion.div>

          <span className="flex items-center gap-1.5 min-w-[10rem] justify-center text-sm font-semibold tabular-nums">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            {formatDateLabel(date)}
          </span>

          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="後一天"
              onClick={goNext}
              disabled={isFutureLocked}
              className="size-8 rounded-full disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </Button>
          </motion.div>

          {!isToday && (
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={goToday}
                className="ml-1 h-8 gap-1.5 rounded-full text-xs"
              >
                <RotateCcw className="size-3.5" />
                今天
              </Button>
            </motion.div>
          )}
        </div>
      </header>

      {/*
        🆕 今日 Hero 大字報 — 取代原本擠在右上角的紅字 chip。
        標題小字 + 大字總額（tabular-nums tracking-tight）+ 筆數副標。
        永遠用 zinc-100/200 中性色，「紅」這個視覺權重留給真正的超預算警示。
      */}
      {hasSpend && (
        <div className="rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            今日總支出
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-zinc-100">
            <Money value={detail.total} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70 tabular-nums">
            共 {totalLabel} 筆消費紀錄
          </p>
        </div>
      )}

      {/* 🆕 今日智囊覆盤 — burn rate + 消費時間軸；無支出時不渲染 */}
      {hasSpend && (
        <DailyAdvisor
          total={detail.total}
          baseline={dailyBaseline}
          items={timelineItems}
        />
      )}

      {/* Body — empty state 或 N 張分類卡 */}
      {hasSpend ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {detail.groups.map((g) => (
            <CategoryGroupCard
              key={g.categoryName}
              group={g}
              dailyBaseline={dailyBaseline}
            />
          ))}
        </div>
      ) : (
        <Card className="border-emerald-500/20 bg-emerald-500/[0.03]">
          <CardContent className="px-6 py-10 text-center">
            <p className="text-2xl">🎉</p>
            <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              太棒了！這天沒有任何花費支出。
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

/* ─────────────────── 單一分類卡片 ─────────────────── */

function CategoryGroupCard({
  group,
  dailyBaseline,
}: {
  group: DailyDetailGroup;
  dailyBaseline: number;
}) {
  // 預留鉤點：未來若把預算資訊接進 DailyDetailGroup，這裡判定超支才走 rose 染色
  const isOverBudget = false;
  // 大額預付判定門檻：baseline 為 0（無預算配置）→ 永不觸發異常 hint
  const anomalyThreshold =
    dailyBaseline > 0 ? dailyBaseline * ANOMALY_MULTIPLIER : Infinity;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-baseline justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: group.categoryColor }}
            />
            <span className="truncate font-medium">{group.categoryName}</span>
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              · {group.items.length} 筆
            </span>
          </span>
          {/* 預設中性 zinc，只有超預算才轉 rose — 避免整頁紅字焦慮 */}
          <span
            className={`shrink-0 font-semibold tabular-nums ${
              isOverBudget ? "text-rose-500" : "text-zinc-200"
            }`}
          >
            <Money value={group.total} />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-foreground/[0.06]">
          {group.items.map((item) => {
            const isAnomaly = item.amount > anomalyThreshold;
            return (
              <li
                key={item.id}
                className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{item.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Wallet className="size-3" />
                      <span className="truncate">{item.accountName}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    <Money value={item.amount} />
                  </span>
                </div>
                {isAnomaly && (
                  <AnomalyHint
                    multiplier={item.amount / dailyBaseline}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * 大額預付 inline 提示 — 偵測 single transaction > daily baseline × 3 的離群值
 * （咖啡寄杯 / 季繳保費 / 半年雜誌訂閱…），引導使用者啟動跨月分攤防止
 * 單日柱狀圖爆表干擾趨勢判讀。
 *
 * 「點此一鍵開啟跨月分攤」目前是 Mock（per spec） — 按了什麼都不做，
 * 純粹標記未來功能的種子點，避免使用者學到「這個按鈕沒用」前的視覺好感先打住。
 */
function AnomalyHint({ multiplier }: { multiplier: number }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-indigo-500/[0.06] px-2.5 py-1.5 text-[11px] leading-relaxed text-zinc-300 ring-1 ring-indigo-500/15">
      <Sparkles
        className="size-3 shrink-0 translate-y-0.5 text-indigo-400"
        aria-hidden
      />
      <span>
        💡 偵測到大額單次預付（達基準的{" "}
        <span className="font-semibold text-indigo-300 tabular-nums">
          {multiplier.toFixed(1)}×
        </span>
        ）—{" "}
        <button
          type="button"
          className="cursor-not-allowed text-indigo-300 underline decoration-indigo-400/40 underline-offset-2 hover:text-indigo-200"
          title="即將推出：把這筆金額自動攤到後續 N 個月，避免單日圖表爆表"
        >
          點此一鍵開啟跨月分攤
        </button>
        ，避免單日圖表爆表。
      </span>
    </div>
  );
}

/* ─────────────────── 💡 今日智囊覆盤 ─────────────────── */

type TimelineItem = DailyDetailItem & {
  categoryName: string;
  categoryColor: string;
};

interface DailyAdvisorProps {
  total: number;
  /** 每日基準預算；0 = 沒設預算 → burn rate 區塊不渲染，只顯示時間軸 */
  baseline: number;
  items: TimelineItem[];
}

/**
 * 💡 今日智囊覆盤 — 兩段：
 *   (a) Burn Rate 文案（baseline > 0 才渲染）：依倍率染色 emerald/amber/rose
 *   (b) 消費時間軸：item.createdAt 由早到晚，含時段 bucket chip（早餐 / 午間 / 下午茶 / 晚間 / 宵夜）
 */
function DailyAdvisor({ total, baseline, items }: DailyAdvisorProps) {
  const hasBudget = baseline > 0;
  const multiplier = hasBudget ? total / baseline : 0;
  const burn = hasBudget ? buildBurnRateMessage(multiplier) : null;

  return (
    <section
      aria-label="今日智囊覆盤"
      className="rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        <Lightbulb className="size-3" />
        今日智囊覆盤
      </p>

      {burn && (
        <p
          className={cn(
            "mt-2 text-sm leading-relaxed tabular-nums",
            burn.toneClass
          )}
        >
          {burn.text}
        </p>
      )}

      {!hasBudget && (
        <p className="mt-2 text-xs text-muted-foreground/80">
          尚未在「分類管理」設定預算，無法計算每日基準。先到 /settings
          設預算後，這裡會自動算出單日燃燒倍率。
        </p>
      )}

      {/* 時間軸 — vertical timeline with bucket chips */}
      <div className="mt-4 flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        <Clock className="size-3" />
        消費時間軸
      </div>
      <ol className="mt-2 flex flex-col">
        {items.map((item, idx) => (
          <TimelineRow
            key={item.id}
            item={item}
            isFirst={idx === 0}
            isLast={idx === items.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}

function TimelineRow({
  item,
  isFirst,
  isLast,
}: {
  item: TimelineItem;
  isFirst: boolean;
  isLast: boolean;
}) {
  const time = formatHM(item.createdAt);
  const bucket = bucketLabel(item.createdAt);
  return (
    <li className="relative grid grid-cols-[3.5rem_1rem_1fr_auto] items-start gap-x-2 py-1.5 text-xs">
      {/* col 1：時間 + 時段 bucket */}
      <div className="flex flex-col items-end gap-0.5 tabular-nums text-muted-foreground">
        <span className="font-mono">{time}</span>
        <span className="rounded-full bg-foreground/[0.04] px-1.5 py-px text-[9px] tracking-wide ring-1 ring-foreground/10">
          {bucket}
        </span>
      </div>
      {/* col 2：垂直線 + 圓點（用 category color） */}
      <div className="relative flex h-full items-center justify-center">
        {!isFirst && (
          <span
            aria-hidden
            className="absolute top-0 bottom-1/2 w-px bg-foreground/15"
          />
        )}
        {!isLast && (
          <span
            aria-hidden
            className="absolute top-1/2 bottom-0 w-px bg-foreground/15"
          />
        )}
        <span
          aria-hidden
          className="relative z-10 size-2.5 rounded-full ring-2 ring-background"
          style={{ backgroundColor: item.categoryColor }}
        />
      </div>
      {/* col 3：標題 + 分類 chip */}
      <div className="min-w-0 leading-relaxed">
        <p className="truncate text-sm font-medium text-foreground">
          {item.title}
        </p>
        <p className="truncate text-[10px] text-muted-foreground/80">
          {item.categoryName} · {item.accountName}
        </p>
      </div>
      {/* col 4：金額 */}
      <span className="shrink-0 self-center text-sm font-medium tabular-nums text-zinc-200">
        <Money value={item.amount} />
      </span>
    </li>
  );
}

/* ─────────────────── Burn rate / Timeline helpers ─────────────────── */

interface BurnMessage {
  text: React.ReactNode;
  toneClass: string;
}

function buildBurnRateMessage(multiplier: number): BurnMessage {
  // 倍率 → 色階 + 文案。妥當設置三個分界，避免「微超 5%」就亮紅
  if (multiplier < 0.5) {
    return {
      toneClass: "text-emerald-400",
      text: (
        <>
          💎 今日只用了每日基準的{" "}
          <strong>{(multiplier * 100).toFixed(0)}%</strong> — 維持得不錯，自由配額還多。
        </>
      ),
    };
  }
  if (multiplier <= 1.0) {
    return {
      toneClass: "text-emerald-400",
      text: (
        <>
          ✅ 今日支出落在每日基準的{" "}
          <strong>{(multiplier * 100).toFixed(0)}%</strong>，仍在配額內。
        </>
      ),
    };
  }
  if (multiplier <= 2.0) {
    const daysLost = Math.max(1, Math.round(multiplier - 1));
    return {
      toneClass: "text-amber-400",
      text: (
        <>
          ⚠️ 今日支出已達每日預算的{" "}
          <strong>{multiplier.toFixed(1)} 倍</strong>，已提前透支未來{" "}
          <strong>{daysLost} 天</strong>的自由配額。
        </>
      ),
    };
  }
  // > 2.0 嚴重
  const daysLost = Math.round(multiplier - 1);
  return {
    toneClass: "text-rose-400",
    text: (
      <>
        🚨 今日支出已達每日預算的{" "}
        <strong>{multiplier.toFixed(1)} 倍</strong>，已提前透支未來{" "}
        <strong>{daysLost} 天</strong>的自由配額。
      </>
    ),
  };
}

/**
 * 時段 bucket 標籤 — 用消費時間直覺切。早餐 06-10 / 午間 11-13 / 下午茶 14-16
 * / 晚間 17-21 / 宵夜 21-26（隔日凌晨 2 點）。深夜走「深夜」中性標。
 */
function bucketLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "未知";
  const h = d.getHours();
  if (h >= 6 && h < 11) return "早餐";
  if (h >= 11 && h < 14) return "午間";
  if (h >= 14 && h < 17) return "下午茶";
  if (h >= 17 && h < 21) return "晚間";
  if (h >= 21 || h < 2) return "宵夜";
  return "深夜";
}

function formatHM(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—:—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* ─────────────────── helpers ─────────────────── */

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

function formatDateLabel(iso: string): string {
  // "2026-05-26" → "2026/05/26 (二)"
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const date = new Date(`${iso}T00:00:00`);
  const weekday = Number.isNaN(date.getTime())
    ? ""
    : ` (${WEEKDAY_ZH[date.getDay()]})`;
  return `${y}/${m}/${d}${weekday}`;
}

/** "2026-05-26" + delta 天 → "2026-05-27"。用 setDate 自動處理跨月跨年 */
function shiftIsoDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
