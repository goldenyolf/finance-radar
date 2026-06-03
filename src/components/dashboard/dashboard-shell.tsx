"use client";

import { Navigation } from "@/components/dashboard/navigation";
import { RecurringBell } from "@/components/dashboard/recurring-bell";
import {
  SidebarCollapsedProvider,
  useSidebarCollapsed,
} from "@/components/sidebar-collapsed-provider";
import type { PlaceholderTransaction } from "@/lib/load-placeholders";
import { cn } from "@/lib/utils";

/**
 * Dashboard 路由組的 client shell。包進 SidebarCollapsedProvider 後：
 *   - Navigation 內的 DesktopSidebar 讀 isCollapsed → 切 w-64 / w-20
 *   - MainPad 同時讀 isCollapsed → 切 md:pl-64 / md:pl-20
 *
 * 為什麼把 shell 拆出 layout.tsx：
 *   - (dashboard)/layout.tsx 保留 server component（可繼續做 server-side
 *     fetch / metadata），shell 才是 client island。
 *   - state 用 Context，避免 prop drilling 到 Navigation 跟 MainPad 兩條
 *     獨立支線。
 *
 * RecurringBell：固定右上角浮動通知鈴鐺，本層接收 server 預取的 placeholders
 * 列表 + 透過 router.refresh() 同步資料變動（confirm 一筆後重整就少一筆）。
 */
export function DashboardShell({
  children,
  placeholders,
}: {
  children: React.ReactNode;
  placeholders: PlaceholderTransaction[];
}) {
  return (
    <SidebarCollapsedProvider>
      <Navigation />
      <RecurringBell placeholders={placeholders} />
      <MainPad>{children}</MainPad>
    </SidebarCollapsedProvider>
  );
}

/**
 * 主內容的 padding 容器。md+ 才有 sidebar，所以 padding-left 只在 md+ 動作。
 * transition 跟 sidebar 同步 — 視覺上 main content 跟著 sidebar 一起滑動。
 *
 * mounted 期間沿用 pl-64（展開預設）— 避免 SSR/hydration 那瞬間 layout
 * 跳一下。pure CSS transition 接手後 (mounted=true)，pl 才會真正切換。
 */
function MainPad({ children }: { children: React.ReactNode }) {
  const { isCollapsed, mounted } = useSidebarCollapsed();
  const effective = mounted && isCollapsed;
  return (
    <div
      className={cn(
        "flex-1 transition-[padding] duration-300 ease-in-out",
        effective ? "md:pl-20" : "md:pl-64"
      )}
    >
      <div className="pb-24 md:pb-0">{children}</div>
    </div>
  );
}
