"use client";

import { useIsMounted } from "@/hooks/use-is-mounted";

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
 * SSR-safe：server 端與 hydration 前一律 render 空字串（server 的時鐘 /
 * 時區跟使用者的不一定一致，直接算會 hydration mismatch），hydrate 後才填。
 * 寬度走 min-w-[8rem] 預留位，避免日期補上後 layout shift。
 *
 * 為什麼不是 useEffect + setState：那個寫法會被 react-hooks/set-state-in-effect
 * 擋下。這裡要表達的是「這個值只有 client 有」，useIsMounted 的
 * server/client snapshot 二元性正好就是該語意。
 */
export function TodayBadge() {
  const mounted = useIsMounted();
  const today = mounted ? formatToday(new Date()) : "";

  return (
    <span
      aria-label="今天日期"
      className="inline-block h-5 min-w-[8rem] text-right text-sm font-medium tabular-nums text-muted-foreground"
    >
      {today}
    </span>
  );
}
