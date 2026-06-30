"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Checkbox — base-ui primitive 包成 shadcn 風單一 component。
 *
 * checked: false / true / "indeterminate" 三態。indeterminate 顯示 Minus icon，
 * 給「主開關全選 / 部分選」場景用（per spec phase 3 配置面板）。
 *
 * 用法：
 *   <Checkbox checked={on} onCheckedChange={setOn} aria-label="..." />
 *   <Checkbox checked="indeterminate" ... />
 */

interface CheckboxProps
  extends Omit<CheckboxPrimitive.Root.Props, "render" | "className"> {
  className?: string;
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <CheckboxPrimitive.Root
        ref={ref as React.Ref<HTMLElement>}
        className={cn(
          // 4mm 方塊，跟 Input/Switch 同款邊框 + 焦點環
          "peer group/checkbox inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-input bg-transparent shadow-sm transition-colors outline-none",
          // checked / indeterminate 共用 emerald 色（對齊 Switch）
          "data-[checked]:border-emerald-500 data-[checked]:bg-emerald-500 data-[checked]:text-white",
          "data-[indeterminate]:border-emerald-500 data-[indeterminate]:bg-emerald-500/60 data-[indeterminate]:text-white",
          // 焦點環
          "focus-visible:ring-3 focus-visible:ring-ring/40",
          // 禁用
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator
          keepMounted
          className="flex items-center justify-center text-current"
        >
          {/*
            兩 icon 都 mount，靠父層 root 的 data-indeterminate 切顯示。比起
            render-function children 更穩，base-ui 1.5 的 Indicator children
            不接 (state) => ReactNode 型別。
          */}
          <Check
            className="size-3 group-data-[indeterminate]/checkbox:hidden"
            strokeWidth={3}
            aria-hidden
          />
          <Minus
            className="hidden size-3 group-data-[indeterminate]/checkbox:block"
            strokeWidth={3}
            aria-hidden
          />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );
  }
);

export { Checkbox };
