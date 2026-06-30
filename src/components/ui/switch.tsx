"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

/**
 * Switch — shadcn 風 API 包 base-ui Switch primitive。
 *
 * 設計對齊 Tooltip / Popover / Dialog：採用 Apple 深色毛玻璃語彙，
 * checked 時走 emerald 強調色，跟「健康狀態 ON」的色彩語意一致。
 *
 * 用法：
 *   <Switch checked={on} onCheckedChange={setOn} aria-label="..." />
 */

interface SwitchProps
  extends Omit<SwitchPrimitive.Root.Props, "render" | "className"> {
  className?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch({ className, ...props }, ref) {
    return (
      <SwitchPrimitive.Root
        ref={ref as React.Ref<HTMLElement>}
        className={cn(
          // 軌道本體 — 行動裝置好按、桌面不顯眼
          "peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-inner transition-colors duration-200 outline-none",
          // 未啟用 = 暗灰玻璃；啟用 = emerald 鮮綠
          "bg-zinc-700/70 data-[checked]:bg-emerald-500/90",
          // 鍵盤焦點環 — 跟 Button 一致
          "focus-visible:ring-3 focus-visible:ring-ring/40",
          // 禁用態
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            // 拇指圓點 — 白色高反差、輕微內陰影
            "pointer-events-none block size-5 translate-x-0.5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200",
            // checked 滑到右邊
            "data-[checked]:translate-x-[1.375rem]"
          )}
        />
      </SwitchPrimitive.Root>
    );
  }
);

export { Switch };
