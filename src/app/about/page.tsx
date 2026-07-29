import type { Metadata } from "next";

import { AboutDashboardPreview } from "@/components/about/dashboard-preview";
import { AboutFeatureGrid } from "@/components/about/feature-grid";
import { AboutFinalCta } from "@/components/about/final-cta";
import { AboutHero } from "@/components/about/hero";
import { AboutLineChatDemo } from "@/components/about/line-chat-demo";
import { AboutPainPoints } from "@/components/about/pain-points";
import { AboutTrustStrip } from "@/components/about/trust-strip";

/**
 * 服務介紹頁 — 唯一一個未登入也看得到的內容頁（見 app/proxy.ts 排除清單）。
 *
 * 刻意放在 src/app/ 頂層，不進任何 route group：
 *   - (dashboard) 會套上 sidebar + 手機底部 tab bar，介紹頁不需要；
 *   - (auth) 會套上全螢幕置中的深色 layout，那是給登入卡片用的。
 * root layout 已經提供 html/body + ThemeProvider，這裡不需要自己的 layout。
 *
 * 全靜態：不 import 任何 load-*.ts、不建 Supabase client、不讀 cookies，
 * 所以 Next 可以在 build 時整頁預渲染。三個後果：
 *   1. 首屏最快，陌生人第一次點進來不用等 RSC 查 DB；
 *   2. 沒有 user_id / RLS 需要顧；
 *   3. 頁面上不可能出現任何一筆真實財務數字（示意數字都是寫死的常數）。
 *
 * 視覺是「深色 hero + 跟隨主題的內容區」混合版型：hero 固定深色接上 /login
 * 的夜空漸層，往下的區塊吃 globals.css token，所以儀表板示意卡片長得跟使用者
 * 登入後真正會看到的畫面一致。
 */
export const metadata: Metadata = {
  title: "Money Radar — 一句話記帳，剩下的它幫你想",
  description:
    "在 LINE 打一句「午餐 120」就記完帳。自動分類、算出這個月還能花多少、快超支時主動提醒你，並自動跑出現金流、分類佔比、財務彈性與資產淨值六個維度的分析。",
  openGraph: {
    title: "Money Radar — 一句話記帳，剩下的它幫你想",
    description:
      "在 LINE 講一句話就記完帳，分析、預算警報、資產淨值自動同步更新。",
    type: "website",
    locale: "zh_TW",
    siteName: "Money Radar",
  },
  twitter: {
    card: "summary_large_image",
    title: "Money Radar — 一句話記帳，剩下的它幫你想",
    description:
      "在 LINE 講一句話就記完帳，分析、預算警報、資產淨值自動同步更新。",
  },
};

export default function AboutPage() {
  return (
    <main className="flex-1 bg-background text-foreground">
      <AboutHero />
      <AboutPainPoints />
      <AboutLineChatDemo />
      <AboutDashboardPreview />
      <AboutFeatureGrid />
      <AboutTrustStrip />
      <AboutFinalCta />
    </main>
  );
}
