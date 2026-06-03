import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { loadPlaceholders } from "@/lib/load-placeholders";

/**
 * Dashboard 路由組 layout — 所有需要 Navigation 的頁面（首頁、夢想、分析、
 * 明細、設定、週期）共用這層。
 *
 * 自身保持 server component；client-side 的 sidebar 摺疊狀態 + 對應的
 * main padding 連動都在 DashboardShell 內處理。
 *
 * 順手在這層 server-side 預取「本月待確認 placeholder」清單給 RecurringBell
 * 用，避免 client 端再打一次 supabase。RSC 跨頁切換時自動隨 router.refresh()
 * 重抓。
 *
 * (auth) 路由組（登入頁）不會經過這個 layout，所以登入時看不到 Navigation。
 */
export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const placeholders = await loadPlaceholders();
  return <DashboardShell placeholders={placeholders}>{children}</DashboardShell>;
}
