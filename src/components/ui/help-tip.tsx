"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  /** Tooltip 內容；可以是 string 或包含格式的 ReactNode */
  children: React.ReactNode;
  /** popup 方向，預設 top */
  side?: "top" | "right" | "bottom" | "left";
  /** icon 額外 className（color / size override） */
  className?: string;
  /** 無障礙 label，預設「說明」 */
  ariaLabel?: string;
}

/**
 * 🆘 Contextual help 便利元件 — HelpCircle icon + Tooltip 一條龍。
 *
 * 既支援桌面 hover/focus（base-ui 原生）、也支援行動版 tap toggle
 * （controlled open + onClick 手動 toggle 雙保險）— 避免 base-ui
 * 在某些觸控裝置上 hover 模擬失效時使用者點不出來。
 *
 * 用法：
 *   <HelpTip>計算公式：(固定支出 ÷ 總收入) × 100%...</HelpTip>
 *
 * 視覺：4×4 muted 灰 icon，inline-flex 對齊文字 baseline 自然。
 */
export function HelpTip({
  children,
  side = "top",
  className,
  ariaLabel = "說明",
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        type="button"
        aria-label={ariaLabel}
        onClick={(e) => {
          // 行動版 tap toggle — 避免 hover 模擬不一致
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          className
        )}
      >
        <HelpCircle className="size-4" />
      </TooltipTrigger>
      <TooltipContent side={side}>{children}</TooltipContent>
    </Tooltip>
  );
}
