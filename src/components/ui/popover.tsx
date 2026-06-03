"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

/**
 * Popover — shadcn 風 API 包 base-ui primitives。
 *
 * 跟 tooltip.tsx 同套設計（base-ui 不是 Radix），確保 Dialog / Select /
 * Tabs / Tooltip / Popover 視覺自然合鳴。
 *
 * 預設 Apple 深色毛玻璃：bg-zinc-950/95 + backdrop-blur-md + border-zinc-800。
 * 開合方向預設 bottom，可由 caller 透過 side / sideOffset 覆寫。
 */

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger {...props} />;
}

interface PopoverContentProps
  extends Omit<PopoverPrimitive.Popup.Props, "side"> {
  /** 距 trigger 間距 px，預設 8 */
  sideOffset?: number;
  /** 開合方向，預設 bottom（往下展） */
  side?: "top" | "right" | "bottom" | "left";
  /** 對齊 trigger 的位置，預設 center */
  align?: "start" | "center" | "end";
  /** 對齊偏移量 px，預設 0 */
  alignOffset?: number;
}

function PopoverContent({
  className,
  sideOffset = 8,
  side = "bottom",
  align = "center",
  alignOffset = 0,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        sideOffset={sideOffset}
        side={side}
        align={align}
        alignOffset={alignOffset}
      >
        <PopoverPrimitive.Popup
          className={cn(
            // Apple 深色毛玻璃 — 跟 tooltip 視覺平行但更紮實（popover 內容多）
            "z-50 max-w-[min(28rem,calc(100vw-1.5rem))] rounded-xl border border-zinc-800 bg-zinc-950/95 p-3 text-zinc-100 shadow-xl backdrop-blur-md",
            // 動畫：開合淡入 / 縮放
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
            // 方向 slide
            "data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
