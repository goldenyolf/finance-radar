"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

/**
 * Tooltip — shadcn 風 API 包 base-ui primitives。
 *
 * 跟其他 ui/ 元件一致走 base-ui（不是 Radix）— Dialog / Select / Tabs 同源
 * 視覺自然合鳴。
 *
 * Mobile tap 支援：base-ui Tooltip 在觸控裝置上會吃 :focus-visible 模擬
 * tap 開啟（trigger 用 <button> 型別自然 focusable）。配合 HelpTip 元件
 * 額外加 onClick 強制 toggle，雙保險。
 */

function TooltipProvider({
  delay = 150,
  closeDelay = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      delay={delay}
      closeDelay={closeDelay}
      {...props}
    />
  );
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger {...props} />;
}

interface TooltipContentProps
  extends Omit<TooltipPrimitive.Popup.Props, "side"> {
  /** popup 距離 trigger 的間距 px，預設 8 */
  sideOffset?: number;
  /** popup 出現的方向，預設 top */
  side?: "top" | "right" | "bottom" | "left";
}

function TooltipContent({
  className,
  sideOffset = 8,
  side = "top",
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner sideOffset={sideOffset} side={side}>
        <TooltipPrimitive.Popup
          className={cn(
            // shadcn-style 深色毛玻璃；強制 dark mode 般質感，但 token 用
            // zinc-900/80 + ring 確保兩個主題都讀得清楚
            "z-50 max-w-xs rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-2.5 text-xs leading-relaxed text-zinc-200 shadow-xl backdrop-blur-md",
            // 動畫
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
            // 方向 slide：依 popup 出現方向做小幅滑入
            "data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
            className
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
