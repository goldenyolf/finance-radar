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

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function todayISO(): string {
  return isoOf(new Date());
}

function offsetISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoOf(d);
}

function monthRange(offsetMonths = 0): DateRange {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0);
  return { from: isoOf(first), to: isoOf(last) };
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
