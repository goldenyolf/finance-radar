"use client";

import { Eye, EyeOff } from "lucide-react";

import { usePrivacy } from "@/components/privacy-provider";
import { cn } from "@/lib/utils";

interface Props {
  /** 視覺變體：sidebar 走橫躺、floating 走圓形浮動鈕 */
  variant?: "sidebar" | "floating";
  /** sidebar 摺疊狀態 — true 時隱藏文字、icon 置中。只對 sidebar variant 有效。 */
  collapsed?: boolean;
  className?: string;
}

/**
 * 防窺模式切換鈕。
 *
 * 行為：點一下 → 全域 isPrivacyMode toggle → PrivacyProvider 把 body[data-privacy]
 * 切到 "on"/"off"，globals.css 的 [data-money] blur rule 立即生效，不需要任何
 * 元件重 render。
 *
 * 跟 ThemeToggle 同款 mounted guard：避免 SSR / 持久化值未讀回前 icon 跳動。
 */
export function PrivacyToggle({
  variant = "sidebar",
  collapsed = false,
  className,
}: Props) {
  const { isPrivacyMode, togglePrivacy, mounted } = usePrivacy();

  const label = mounted
    ? isPrivacyMode
      ? "關閉防窺模式（顯示金額）"
      : "開啟防窺模式（碼掉金額）"
    : "防窺模式";

  if (variant === "floating") {
    return (
      <button
        type="button"
        onClick={togglePrivacy}
        aria-label={label}
        aria-pressed={isPrivacyMode}
        title={label}
        className={cn(
          "grid size-10 place-items-center rounded-full bg-background/80 ring-1 ring-foreground/15 shadow-sm backdrop-blur-md transition-colors hover:bg-background hover:ring-foreground/30",
          isPrivacyMode &&
            "ring-emerald-500/50 hover:ring-emerald-500/70 dark:ring-emerald-400/60",
          className
        )}
      >
        <PrivacyIcon on={isPrivacyMode} mounted={mounted} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={togglePrivacy}
      aria-label={label}
      aria-pressed={isPrivacyMode}
      title={label}
      className={cn(
        "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground",
        collapsed ? "justify-center px-2" : "px-3",
        isPrivacyMode &&
          "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300",
        className
      )}
    >
      <PrivacyIcon on={isPrivacyMode} mounted={mounted} />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-all duration-300",
          collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
        )}
      >
        {mounted ? (isPrivacyMode ? "防窺中" : "防窺模式") : "防窺模式"}
      </span>
    </button>
  );
}

/**
 * Eye ↔ EyeOff 交叉淡入淡出 — 兩 icon 都 render，opacity + scale 切換，
 * 跟 ThemeToggle 同款手法保持視覺一致。
 */
function PrivacyIcon({ on, mounted }: { on: boolean; mounted: boolean }) {
  if (!mounted) {
    return <Eye className="size-4 opacity-60" />;
  }
  return (
    <span className="relative inline-flex size-4">
      <Eye
        className={cn(
          "absolute inset-0 size-4 transition-all duration-300",
          on ? "scale-0 opacity-0" : "scale-100 opacity-100"
        )}
      />
      <EyeOff
        className={cn(
          "absolute inset-0 size-4 transition-all duration-300",
          on ? "scale-100 opacity-100" : "scale-0 opacity-0"
        )}
      />
    </span>
  );
}
