import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Navigation } from "@/components/dashboard/navigation";
import { Toaster } from "@/components/ui/sonner";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navigation />
        {/*
         * 主內容 padding：
         *   - md+：左側保留 sidebar 寬度 (14rem = w-56)
         *   - <md：底部保留 tab bar 高度 (h-16 = 4rem) + 一點呼吸空間（pb-24 = 6rem），
         *           並加上 safe-area 處理瀏海手機
         */}
        <div className="flex-1 md:pl-56">
          <div className="pb-24 md:pb-0">{children}</div>
        </div>
        <Toaster richColors closeButton position="top-center" />
      </body>
    </html>
  );
}
