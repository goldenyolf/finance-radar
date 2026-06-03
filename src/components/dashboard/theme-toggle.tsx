"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  /** 視覺變體：sidebar 走橫躺、floating 走圓形浮動鈕 */
  variant?: "sidebar" | "floating";
  /** sidebar 摺疊狀態 — true 時隱藏文字、icon 置中。只對 sidebar variant 有效。 */
  collapsed?: boolean;
  className?: string;
}

/**
 * 主題切換按鈕。next-themes 的 hook 在 SSR 階段拿不到正確值，
 * 所以用 mounted guard：未掛載前先 render placeholder 避免 hydration mismatch。
 */
export function ThemeToggle({
  variant = "sidebar",
  collapsed = false,
  className,
}: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  function toggle() {
    setTheme(isDark ? "light" : "dark");
  }

  if (variant === "floating") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={isDark ? "切換到淺色模式" : "切換到深色模式"}
        className={cn(
          "grid size-10 place-items-center rounded-full bg-background/80 ring-1 ring-foreground/15 shadow-sm backdrop-blur-md transition-colors hover:bg-background hover:ring-foreground/30",
          className
        )}
      >
        <ThemeIcon isDark={isDark} mounted={mounted} />
      </button>
    );
  }

  // sidebar variant：跟其他 nav item 同 layout
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "切換到淺色模式" : "切換到深色模式"}
      className={cn(
        "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground",
        collapsed ? "justify-center px-2" : "px-3",
        className
      )}
    >
      <ThemeIcon isDark={isDark} mounted={mounted} />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-all duration-300",
          collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
        )}
      >
        {mounted ? (isDark ? "淺色模式" : "深色模式") : "主題"}
      </span>
    </button>
  );
}

/**
 * Sun/Moon 交叉淡入淡出 — 兩個 icon 都 render，靠 opacity 切換，
 * 比起換 component 更平滑（沒有 layout shift）。
 */
function ThemeIcon({
  isDark,
  mounted,
}: {
  isDark: boolean;
  mounted: boolean;
}) {
  // 沒掛載完前先顯示 Moon 當佔位（任意挑一個都行；isDark 為 false 不影響 SSR）
  if (!mounted) {
    return <Moon className="size-4 opacity-60" />;
  }
  return (
    <span className="relative inline-flex size-4">
      <Sun
        className={cn(
          "absolute inset-0 size-4 transition-all duration-300",
          isDark ? "scale-0 opacity-0" : "scale-100 opacity-100"
        )}
      />
      <Moon
        className={cn(
          "absolute inset-0 size-4 transition-all duration-300",
          isDark ? "scale-100 opacity-100" : "scale-0 opacity-0"
        )}
      />
    </span>
  );
}
