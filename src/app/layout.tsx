import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { PrivacyProvider } from "@/components/privacy-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "個人財務戰情室",
  description: "一目了然掌握你的財務狀況",
  /**
   * Apple 全螢幕 PWA 配置 — 對應 spec 三條 meta：
   *   - apple-mobile-web-app-capable=yes
   *   - apple-mobile-web-app-status-bar-style=black-translucent
   *   - apple-mobile-web-app-title=Money Radar
   * Next.js metadata API 會自動展開成對應 <meta> 標籤。
   *
   * status-bar=black-translucent：iOS 把狀態列（時間 / 訊號 / 電量）
   * 變透明、內容會被 push 到狀態列下方 — 配 #09090b 底色等於頂部時間
   * 完美融進純黑背景，有真正 native App 的感覺。
   */
  appleWebApp: {
    capable: true,
    title: "Money Radar",
    statusBarStyle: "black-translucent",
  },
  /** PWA 圖示路徑 — 待補實際 icon 檔到 public/ 才會生效 */
  icons: {
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

/**
 * Viewport — Next 13+ 把 themeColor / viewport-fit 從 metadata 拆到這支
 * 獨立 export。
 *
 * themeColor=#09090b zinc-950：Android Chrome 地址列 / iOS PWA 狀態列
 * 背景跟隨此色，純黑融合。
 * viewport-fit=cover：iOS 瀏海手機 safe-area 由 CSS env() 處理，這裡
 * 解鎖允許內容延伸到圓角區域。
 */
export const viewport: Viewport = {
  themeColor: "#09090b",
  viewportFit: "cover",
};

/**
 * Root layout — 全 app 共用：html/body + 字型 + 主題 + Toaster。
 *
 * Navigation 跟「sidebar 留白 / mobile 底部」這套架構已搬到
 * (dashboard)/layout.tsx，因為登入頁 (auth) 不需要這些。
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PrivacyProvider>
            <TooltipProvider>
              {children}
              <Toaster richColors closeButton position="top-center" />
            </TooltipProvider>
          </PrivacyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
