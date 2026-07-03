"use client";

import { useState } from "react";
import { CalendarRange, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * DatePickerWithRange — 暗黑風日期區間選取器。
 *
 * 走 base-ui Popover + 兩個 native <input type="date">，避免引入 react-day-picker
 * 大型依賴；色票直接走專案既有 zinc / ring tokens，確保和 Tooltip/Popover/Select
 * 視覺一致。trigger 直接套 buttonVariants（不能 render={<Button/>}，會踩到
 * base-ui 1.5 useButton() 衝突的地雷）。
 *
 * 父層拿 controlled value/onChange，from/to 用 ISO YYYY-MM-DD 字串型別，跟
 * Supabase `date` 欄位直接比對；null = 該端無限制。
 */

export interface DateRange {
  from: string | null;
  to: string | null;
}

interface Props {
  value: DateRange;
  onChange: (next: DateRange) => void;
  /** trigger 上未設定區間時的 placeholder 文字 */
  placeholder?: string;
  className?: string;
}

function fmt(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
}

/*
  per review #15：transactions.date 存 Asia/Taipei YYYY-MM-DD 字串
  （見 analytics-view.tsx::todayIsoTaipei）；presets 若用瀏覽器本地時區算
  在跨時區 user（旅遊 / 家人裝置設不同 TZ）會 boundary 差一天。統一走
  Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }) — en-CA locale
  直接吐 YYYY-MM-DD，跟 DB 儲存格式對齊。
*/
const TAIPEI_TZ = "Asia/Taipei";

function taipeiYmd(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const d = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  return { y, m, d };
}

function isoOf(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function todayISO(): string {
  const { y, m, d } = taipeiYmd(new Date());
  return isoOf(y, m, d);
}

function offsetISO(days: number): string {
  // 從 Taipei 「今天」往回推 days 天。用純日期算術避免夏令時間 edge case。
  const { y, m, d } = taipeiYmd(new Date());
  // 建 UTC noon 那天，加減天數穩定不受 DST 影響
  const base = new Date(Date.UTC(y, m - 1, d, 12));
  base.setUTCDate(base.getUTCDate() - days);
  return isoOf(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate()
  );
}

function monthRange(offsetMonths = 0): DateRange {
  const { y, m } = taipeiYmd(new Date());
  // JS Date 用 (year, monthIndex 0-based)，跨年 offset 靠自動 normalize
  const first = new Date(Date.UTC(y, m - 1 + offsetMonths, 1, 12));
  const last = new Date(Date.UTC(y, m + offsetMonths, 0, 12));
  return {
    from: isoOf(
      first.getUTCFullYear(),
      first.getUTCMonth() + 1,
      first.getUTCDate()
    ),
    to: isoOf(
      last.getUTCFullYear(),
      last.getUTCMonth() + 1,
      last.getUTCDate()
    ),
  };
}

const PRESETS: Array<{ label: string; build: () => DateRange }> = [
  { label: "本月", build: () => monthRange(0) },
  { label: "上月", build: () => monthRange(-1) },
  { label: "近 30 天", build: () => ({ from: offsetISO(29), to: todayISO() }) },
  { label: "近 90 天", build: () => ({ from: offsetISO(89), to: todayISO() }) },
];

export function DatePickerWithRange({
  value,
  onChange,
  placeholder = "選擇日期區間",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasRange = Boolean(value.from || value.to);

  const labelText = hasRange
    ? `${fmt(value.from) || "起"}  ~  ${fmt(value.to) || "今"}`
    : placeholder;

  return (
    <div className={cn("inline-flex items-stretch gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          type="button"
          aria-label={hasRange ? `日期區間：${labelText}` : placeholder}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-11 min-w-[10rem] justify-start gap-2 px-3 text-sm font-normal tabular-nums",
            !hasRange && "text-muted-foreground"
          )}
        >
          <CalendarRange className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{labelText}</span>
        </PopoverTrigger>

        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={8}
          className="w-[min(20rem,calc(100vw-1.5rem))] p-3"
        >
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px] font-medium tracking-wider text-zinc-400 uppercase">
                起始
                <input
                  type="date"
                  value={value.from ?? ""}
                  max={value.to ?? undefined}
                  onChange={(e) =>
                    onChange({ ...value, from: e.target.value || null })
                  }
                  className="h-9 rounded-md border border-zinc-700 bg-zinc-900/70 px-2 text-sm tabular-nums text-zinc-100 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 [color-scheme:dark]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium tracking-wider text-zinc-400 uppercase">
                結束
                <input
                  type="date"
                  value={value.to ?? ""}
                  min={value.from ?? undefined}
                  onChange={(e) =>
                    onChange({ ...value, to: e.target.value || null })
                  }
                  className="h-9 rounded-md border border-zinc-700 bg-zinc-900/70 px-2 text-sm tabular-nums text-zinc-100 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 [color-scheme:dark]"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    onChange(p.build());
                    setOpen(false);
                  }}
                >
                  {p.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto text-muted-foreground"
                onClick={() => {
                  onChange({ from: null, to: null });
                  setOpen(false);
                }}
              >
                清除
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {hasRange && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="清除日期區間"
          title="清除日期區間"
          className="h-11 w-9 text-muted-foreground hover:text-foreground"
          onClick={() => onChange({ from: null, to: null })}
        >
          <X className="size-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}
