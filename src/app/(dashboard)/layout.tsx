import { DashboardShell } from "@/components/dashboard/dashboard-shell";

/**
 * Dashboard 路由組 layout — 所有需要 Navigation 的頁面（首頁、夢想、分析、
 * 明細、設定、週期）共用這層。
 *
 * 自身保持 server component；client-side 的 sidebar 摺疊狀態 + 對應的
 * main padding 連動都在 DashboardShell 內處理。
 *
 * (auth) 路由組（登入頁）不會經過這個 layout，所以登入時看不到 Navigation。
 */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DashboardShell>{children}</DashboardShell>;
}
