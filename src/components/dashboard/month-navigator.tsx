"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  selectedDate: Date;
  onChange: (next: Date) => void;
  /** 真實當下時間（用來算「本月」與限制不能往未來移動）。預設 new Date()。 */
  now?: Date;
}

function sameYearMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function shiftMonth(d: Date, delta: number): Date {
  // 用 day=1 構造，避免月底邊界（5/31 - 1 month = 4/30）的 JS Date 陷阱
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

export function MonthNavigator({ selectedDate, onChange, now }: Props) {
  const realNow = now ?? new Date();
  const isCurrentMonth = sameYearMonth(selectedDate, realNow);
  const label = `${selectedDate.getFullYear()} 年 ${selectedDate.getMonth() + 1} 月`;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="上一個月"
        onClick={() => onChange(shiftMonth(selectedDate, -1))}
        className="size-8 rounded-full"
      >
        <ChevronLeft className="size-4" />
      </Button>

      <span className="min-w-[7rem] text-center text-sm font-semibold tabular-nums">
        {label}
      </span>

      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="下一個月"
        onClick={() => onChange(shiftMonth(selectedDate, 1))}
        disabled={isCurrentMonth}
        className="size-8 rounded-full disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </Button>

      {!isCurrentMonth && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(new Date(realNow))}
          className="ml-1 h-8 gap-1.5 rounded-full text-xs"
        >
          <RotateCcw className="size-3.5" />
          回到本月
        </Button>
      )}
    </div>
  );
}
