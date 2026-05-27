"use client";

import CountUp from "react-countup";

import { formatCurrency } from "@/lib/dashboard";

interface Props {
  value: number;
  /** 動畫時長（秒）。預設 0.9 秒，符合 spec 0.8-1.0 區間。 */
  duration?: number;
  /** 自訂格式化函式；預設 NT$1,234 千分位幣別格式 */
  format?: (n: number) => string;
  /** 切到負值時要不要顯示負號（formatCurrency 已處理，這只是 fallback） */
  className?: string;
}

/**
 * 數字滾動元件 — 包 react-countup 並套用 formatCurrency 預設。
 * preserveValue=true：value prop 改變時從「上一次數字」滾動到新值，
 * 而不是每次都從 0 起跳，避免月份切換時刺眼歸零。
 *
 * data-money：給防窺模式用。globals.css 的
 *   body[data-privacy="on"] [data-money] { filter: blur(...) }
 * rule 會自動 blur 這個 span，不需要每個 caller 改任何 code。
 */
export function AnimatedNumber({
  value,
  duration = 0.9,
  format,
  className,
}: Props) {
  return (
    <span data-money className={className}>
      <CountUp
        end={value}
        duration={duration}
        preserveValue
        formattingFn={format ?? formatCurrency}
      />
    </span>
  );
}
