"use client";

import { useEffect, useState } from "react";

const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];

function formatToday(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day} (${WEEKDAYS_ZH[d.getDay()]})`;
}

/**
 * 系統時鐘風格的「今天日期」標籤。
 *
 * SSR-safe：初值為空字串，useEffect 後才填入。SSR 與 client 首次渲染都是
 * 空字串 → 不會 hydration mismatch。寬度走 min-w-[8rem] 預留位，避免日期
 * 補上後 layout shift。
 */
export function TodayBadge() {
  const [today, setToday] = useState<string>("");

  useEffect(() => {
    setToday(formatToday(new Date()));
  }, []);

  return (
    <span
      aria-label="今天日期"
      className="inline-block h-5 min-w-[8rem] text-right text-sm font-medium tabular-nums text-muted-foreground"
    >
      {today}
    </span>
  );
}
