import { Navigation } from "@/components/dashboard/navigation";

/**
 * Dashboard 路由組 layout — 所有需要 Navigation 的頁面（首頁、夢想、分析、
 * 明細、設定、週期）共用這層。Navigation 的 mobile bottom tab bar + 桌面
 * sidebar 都在這裡 render。
 *
 * (auth) 路由組（登入頁）不會經過這個 layout，所以登入時看不到 Navigation。
 */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Navigation />
      {/*
       * 主內容 padding：
       *   - md+：左側保留 sidebar 寬度 (14rem = w-56)
       *   - <md：底部保留 tab bar 高度 (h-16 = 4rem) + 一點呼吸空間 (pb-24)，
       *           並加上 safe-area 處理瀏海手機
       */}
      <div className="flex-1 md:pl-56">
        <div className="pb-24 md:pb-0">{children}</div>
      </div>
    </>
  );
}
