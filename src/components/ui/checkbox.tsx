"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Checkbox — base-ui primitive 包成 shadcn 風單一 component。
 *
 * checked / indeterminate 兩 prop 分離控制（base-ui 1.5 語意）。
 * per review #12：不再靠 base-ui Indicator（它 keepMounted=true 時
 * unchecked 也會 render 一個含 Check 的空 span，即使 CSS 想藏也可能被
 * transitionStatus attrs 破壞）。改為直接把 Check / Minus 放進 Root，
 * 只靠 root 的 data-checked / data-indeterminate 決定誰顯示：
 *   - data-indeterminate → 顯示 Minus
 *   - data-checked（不 indeterminate）→ 顯示 Check
 *   - 都沒有（unchecked）→ 兩個都藏
 *
 * 用法：
 *   <Checkbox checked={on} onCheckedChange={setOn} aria-label="..." />
 *   <Checkbox checked={false} indeterminate={true} ... />
 */

interface CheckboxProps
  extends Omit<CheckboxPrimitive.Root.Props, "render" | "className" | "children"> {
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
        {/*
          Check 只在 data-checked 且非 indeterminate 時顯示；
          Minus 只在 data-indeterminate 時顯示。
          unchecked 兩個都藏（hidden by default），對齊使用者對「空 checkbox」的預期。
        */}
        <Check
          aria-hidden
          strokeWidth={3}
          className="hidden size-3 group-data-[checked]/checkbox:block group-data-[indeterminate]/checkbox:hidden"
        />
        <Minus
          aria-hidden
          strokeWidth={3}
          className="hidden size-3 group-data-[indeterminate]/checkbox:block"
        />
      </CheckboxPrimitive.Root>
    );
  }
);

export { Checkbox };
