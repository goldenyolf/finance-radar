"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PieChart, ScrollText, Settings, type LucideIcon } from "lucide-react";

import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "首頁", icon: Home },
  { href: "/analytics", label: "分析", icon: PieChart },
  { href: "/transactions", label: "明細", icon: ScrollText },
  { href: "/settings", label: "設定", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 兩態導航：md+ 走左側 sidebar、<md 走底部 tab bar。兩個版本在同一個元件
 * 用 hidden / md:hidden 切，避免在 layout 寫雙重 import。
 */
export function Navigation() {
  const pathname = usePathname();

  return (
    <>
      <DesktopSidebar pathname={pathname} />
      <MobileTabBar pathname={pathname} />
      {/* Mobile 主題切換：右上角浮動鈕，只在 <md 顯示（desktop 走 sidebar 底部） */}
      <ThemeToggle
        variant="floating"
        className="fixed top-3 right-3 z-30 md:hidden"
      />
    </>
  );
}

/* ─────────────────────────── Desktop Sidebar ─────────────────────────── */

function DesktopSidebar({ pathname }: { pathname: string }) {
  return (
    <aside
      aria-label="主要導航"
      className="fixed top-0 bottom-0 left-0 z-30 hidden w-56 flex-col border-r border-foreground/10 bg-background/95 backdrop-blur-md md:flex"
    >
      <div className="flex h-16 items-center gap-2 border-b border-foreground/10 px-5">
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-lg bg-foreground text-background"
        >
          <PieChart className="size-4" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
            Money Radar
          </span>
          <span className="text-sm font-semibold">戰情室</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
              )}
            >
              <Icon className={cn("size-4", active && "text-foreground")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Sidebar 底部：主題切換 */}
      <div className="border-t border-foreground/10 p-3">
        <ThemeToggle variant="sidebar" />
      </div>
    </aside>
  );
}

/* ─────────────────────────── Mobile Tab Bar ─────────────────────────── */

function MobileTabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="主要導航"
      className="fixed right-0 bottom-0 left-0 z-30 flex h-16 items-stretch border-t border-foreground/10 bg-background/85 backdrop-blur-lg pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full transition-colors",
                active && "bg-foreground/[0.08]"
              )}
            >
              <Icon className="size-[18px]" />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
