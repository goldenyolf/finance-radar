"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

import { cn } from "@/lib/utils";

/**
 * Collapsible — 單一面板的展開 / 收合容器，比 Accordion 更輕。
 *
 * 動畫對齊 tw-animate-css 的 collapsible 語意：`animate-collapsible-down`
 * / `animate-collapsible-up` — 這組 keyframe 走 --radix-collapsible-content-height
 * 為目標高度。base-ui Collapsible 只暴露 --collapsible-panel-height，globals.css
 * 有一條 alias rule 把兩個變數接起來（見 globals.css `[data-slot="collapsible-content"]`
 * 段落，per review #11 fix）。
 *
 * 用法：
 *   <Collapsible open={open} onOpenChange={setOpen}>
 *     <CollapsibleTrigger>...</CollapsibleTrigger>
 *     <CollapsibleContent>...</CollapsibleContent>
 *   </Collapsible>
 */

function Collapsible({
  className,
  ...props
}: CollapsiblePrimitive.Root.Props) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      className={cn("flex w-full flex-col", className)}
      {...props}
    />
  );
}

function CollapsibleTrigger({
  className,
  ...props
}: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        "group/collapsible-trigger inline-flex items-center gap-1.5 rounded-md outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40",
        className
      )}
      {...props}
    />
  );
}

function CollapsibleContent({
  className,
  children,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className="overflow-hidden text-sm data-open:animate-collapsible-down data-closed:animate-collapsible-up"
      {...props}
    >
      <div className={cn(className)}>{children}</div>
    </CollapsiblePrimitive.Panel>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
