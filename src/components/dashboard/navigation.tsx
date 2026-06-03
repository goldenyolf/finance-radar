"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
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
import { useSidebarCollapsed } from "@/components/sidebar-collapsed-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/*
  順序語意（依使用頻率由高到低重排）：
    高頻 daily  : 首頁 → 明細 → 分析
    中頻 monthly: 資產（月度淨值快照）
    低頻 rare  : 夢想（儲蓄目標管理）
    系統     : 設定

  桌面 sidebar 走完整 6 項目。
*/
const DESKTOP_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "首頁", icon: Home },
  { href: "/transactions", label: "明細", icon: ScrollText },
  { href: "/analytics", label: "分析", icon: PieChart },
  { href: "/net-worth", label: "資產", icon: Wallet },
  { href: "/goals", label: "夢想", icon: Target },
  { href: "/settings", label: "設定", icon: Settings },
];

/*
  手機底部 tab bar 走 5 項目。前 4 是核心高頻功能，第 5 個「更多」是
  通往 /more 大廳的入口 — 那裡可以再進去夢想 / 設定 兩個低頻功能。

  這套「More Hub 模式」是 iOS 經典做法（Twitter / Slack / Spotify 等
  都用過），避開「6 個 tab 擠成糊狀」的觸控災難又不犧牲功能對等。
*/
const MOBILE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "首頁", icon: Home },
  { href: "/transactions", label: "明細", icon: ScrollText },
  { href: "/analytics", label: "分析", icon: PieChart },
  { href: "/net-worth", label: "資產", icon: Wallet },
  { href: "/more", label: "更多", icon: Settings },
];

/** 「更多」tab 視為「section」: 在 /more 大廳 OR 大廳裡的兩個目的地都算 active */
const MOBILE_MORE_SECTION_PREFIXES = ["/more", "/settings", "/goals"];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isActiveMobile(pathname: string, href: string): boolean {
  if (href === "/more") {
    return MOBILE_MORE_SECTION_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
  }
  return isActive(pathname, href);
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

        位置：右上往左移到 right-[3.75rem]，留 right-3 給 RecurringBell；
        size-10 鈴鐺寬 2.5rem + 0.5rem 安全間距 = 3rem，3.75rem 留 0.75rem 呼吸感。
      */}
      <div className="fixed top-3 right-[3.75rem] z-30 flex items-center gap-2 md:hidden">
        <PrivacyToggle variant="floating" />
        <ThemeToggle variant="floating" />
      </div>
    </>
  );
}

/* ─────────────────────────── Desktop Sidebar ─────────────────────────── */

function DesktopSidebar({ pathname }: { pathname: string }) {
  const { isCollapsed, toggle, mounted } = useSidebarCollapsed();
  // mounted 前一律走「展開」狀態，避免 hydration mismatch flash（SSR HTML 出
  // 展開版，client 掛載後若使用者偏好摺疊，再 transition 縮進去）
  const collapsed = mounted && isCollapsed;

  return (
    <aside
      aria-label="主要導航"
      // group + 邊框微光：hover (鼠標) / focus-within (鍵盤) 任一觸發即喚醒
      // toggle 鈕跟邊框升色。border-r 顯式走 literal zinc-900/800 配合
      // 深色「moody edge」美學（per spec）。
      className={cn(
        "group fixed top-0 bottom-0 left-0 z-30 hidden flex-col border-r border-zinc-900 bg-background/95 backdrop-blur-md transition-[width,border-color] duration-300 ease-in-out hover:border-zinc-800 focus-within:border-zinc-800 md:flex",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Header — logo + 文字 */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-foreground/10",
          collapsed ? "justify-center px-0" : "gap-2 px-5"
        )}
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background"
        >
          <PieChart className="size-4" />
        </span>
        <div
          className={cn(
            "flex flex-col leading-tight overflow-hidden whitespace-nowrap transition-all duration-300",
            collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
          )}
        >
          <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
            Money Radar
          </span>
          <span className="text-sm font-semibold">戰情室</span>
        </div>
      </div>

      {/*
        Hover-to-Reveal 摺疊鈕 — 預設 opacity-0 + scale-95 + pointer-events-none
        完全不干擾游標；side bar hover / focus-within / button focus-visible
        三個觸發點任一即浮現。按鈕本體跨越 aside 右邊界（-right-3）形成
        「邊緣浮現」視覺亮點。

        為什麼要 absolute 在 <aside> 直接子層而非 header 內：top-12 是相對
        sidebar 量、不是 header 量；放在 header 裡會被 overflow 行為干擾。
      */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "展開側邊欄" : "收合側邊欄"}
        aria-pressed={collapsed}
        className={cn(
          "absolute top-12 -right-3 z-50 flex size-6 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/90 text-zinc-400 shadow-md backdrop-blur-md cursor-pointer",
          "opacity-0 scale-95 pointer-events-none",
          "transition-all duration-200",
          "hover:text-zinc-200",
          "group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto",
          "group-focus-within:opacity-100 group-focus-within:scale-100 group-focus-within:pointer-events-auto",
          "focus-visible:opacity-100 focus-visible:scale-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/40"
        )}
      >
        {collapsed ? (
          <ChevronRight className="size-3.5" strokeWidth={2.5} />
        ) : (
          <ChevronLeft className="size-3.5" strokeWidth={2.5} />
        )}
      </button>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {DESKTOP_NAV_ITEMS.map((item) => (
          <NavLinkItem
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Sidebar 底部：防窺 + 主題切換 + 登出 — 摺疊時改用 Tooltip 標籤 */}
      <div className="flex flex-col gap-1 border-t border-foreground/10 p-3">
        <SidebarTooltipWrap label="防窺模式" enabled={collapsed}>
          <PrivacyToggle variant="sidebar" collapsed={collapsed} />
        </SidebarTooltipWrap>
        <SidebarTooltipWrap label="切換主題" enabled={collapsed}>
          <ThemeToggle variant="sidebar" collapsed={collapsed} />
        </SidebarTooltipWrap>
        <SidebarTooltipWrap label="登出" enabled={collapsed}>
          <SignOutButton collapsed={collapsed} />
        </SidebarTooltipWrap>
      </div>
    </aside>
  );
}

/* ─────────────────────────── Sidebar helpers ─────────────────────────── */

/**
 * 一條 nav link。摺疊時：
 *   - text span 用 w-0 opacity-0 fade 出去
 *   - button 視覺變成方形包 icon
 *   - 整顆包進 Tooltip，hover 顯示右側中文標籤
 */
function NavLinkItem({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={cn(
        "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors",
        collapsed ? "justify-center px-2" : "px-3",
        active
          ? "bg-foreground/[0.08] text-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
      )}
    >
      <Icon className={cn("size-4 shrink-0", active && "text-foreground")} />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-all duration-300",
          collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
        )}
      >
        {item.label}
      </span>
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right" sideOffset={12}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * 給底部 toggle 群（PrivacyToggle / ThemeToggle / SignOutButton）共用的
 * Tooltip 包殼。enabled=false 時 pass-through 不包，避免展開狀態下
 * tooltip 跟既有 inline label 重疊。
 */
function SidebarTooltipWrap({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger render={children as React.ReactElement} />
      <TooltipContent side="right" sideOffset={12}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/* ─────────────────────────── Mobile Tab Bar ─────────────────────────── */

function MobileTabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="主要導航"
      className="fixed right-0 bottom-0 left-0 z-30 flex h-16 items-stretch border-t border-foreground/10 bg-background/85 backdrop-blur-lg pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {MOBILE_NAV_ITEMS.map((item) => {
        const active = isActiveMobile(pathname, item.href);
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
