"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  PieChart,
  ScrollText,
  Settings,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { PrivacyToggle } from "@/components/dashboard/privacy-toggle";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * true = 只在桌面 sidebar 顯示；手機底部 tab bar 隱藏。
   * 用在低頻、版位有限時需要犧牲的功能（避免 6 個 tab 擠壓觸控目標）。
   */
  desktopOnly?: boolean;
}

/*
  順序語意（依使用頻率由高到低重排）：
    高頻 daily  : 首頁 → 明細 → 分析
    中頻 monthly: 資產（月度淨值快照）
    低頻 rare  : 夢想（儲蓄目標管理）
    系統     : 設定（永遠最下面）

  手機底部 tab bar：5 格（首頁 / 明細 / 分析 / 資產 / 設定）。
  夢想標 desktopOnly — 行動版手指要按 6 格寬度太擠，犧牲低頻功能換觸控品質。
*/
const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "首頁", icon: Home },
  { href: "/transactions", label: "明細", icon: ScrollText },
  { href: "/analytics", label: "分析", icon: PieChart },
  { href: "/net-worth", label: "資產", icon: Wallet },
  { href: "/goals", label: "夢想", icon: Target, desktopOnly: true },
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
      {/*
        Mobile 右上浮動工具列：防窺 + 主題切換。只在 <md 顯示（desktop 走 sidebar 底部）。
        順序：防窺在左、主題在右 — 防窺是 demo 時最常用的「擋一下」動作，放手指最容易碰的位置。
      */}
      <div className="fixed top-3 right-3 z-30 flex items-center gap-2 md:hidden">
        <PrivacyToggle variant="floating" />
        <ThemeToggle variant="floating" />
      </div>
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

      {/* Sidebar 底部：防窺 + 主題切換 + 登出 */}
      <div className="border-t border-foreground/10 p-3 flex flex-col gap-1">
        <PrivacyToggle variant="sidebar" />
        <ThemeToggle variant="sidebar" />
        <SignOutButton />
      </div>
    </aside>
  );
}

/* ─────────────────────────── Mobile Tab Bar ─────────────────────────── */

function MobileTabBar({ pathname }: { pathname: string }) {
  // 過濾 desktopOnly — 行動版只留高頻 4 個 + 設定 = 5 格，每格 ~75px 觸控舒適
  const mobileItems = NAV_ITEMS.filter((item) => !item.desktopOnly);

  return (
    <nav
      aria-label="主要導航"
      className="fixed right-0 bottom-0 left-0 z-30 flex h-16 items-stretch border-t border-foreground/10 bg-background/85 backdrop-blur-lg pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {mobileItems.map((item) => {
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
