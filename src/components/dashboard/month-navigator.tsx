"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  selectedDate: Date;
  onChange: (next: Date) => void;
  /** 真實當下時間（用來算「本月」與限制不能往未來移動）。預設 new Date()。 */
  now?: Date;
  /** 切換進行中時鎖按鈕，避免 spam clicks 觸發多次 setTimeout。 */
  disabled?: boolean;
}

function sameYearMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function shiftMonth(d: Date, delta: number): Date {
  // 用 day=1 構造，避免月底邊界（5/31 - 1 month = 4/30）的 JS Date 陷阱
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

// Framer Motion 微互動 — whileHover 微微放大、whileTap 按壓回彈
const MOTION_PROPS = {
  whileHover: { scale: 1.05 },
  whileTap: { scale: 0.92 },
  transition: { type: "spring" as const, stiffness: 400, damping: 22 },
};

export function MonthNavigator({
  selectedDate,
  onChange,
  now,
  disabled,
}: Props) {
  const realNow = now ?? new Date();
  const isCurrentMonth = sameYearMonth(selectedDate, realNow);
  const label = `${selectedDate.getFullYear()} 年 ${selectedDate.getMonth() + 1} 月`;

  return (
    <div className="flex items-center gap-2">
      <motion.div {...MOTION_PROPS}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="上一個月"
          onClick={() => onChange(shiftMonth(selectedDate, -1))}
          disabled={disabled}
          className="size-8 rounded-full"
        >
          <ChevronLeft className="size-4" />
        </Button>
      </motion.div>

      <span className="min-w-[7rem] text-center text-sm font-semibold tabular-nums">
        {label}
      </span>

      <motion.div {...MOTION_PROPS}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="下一個月"
          onClick={() => onChange(shiftMonth(selectedDate, 1))}
          disabled={isCurrentMonth || disabled}
          className="size-8 rounded-full disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </Button>
      </motion.div>

      {!isCurrentMonth && (
        <motion.div {...MOTION_PROPS}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(new Date(realNow))}
            disabled={disabled}
            className="ml-1 h-8 gap-1.5 rounded-full text-xs"
          >
            <RotateCcw className="size-3.5" />
            回到本月
          </Button>
        </motion.div>
      )}
    </div>
  );
}
