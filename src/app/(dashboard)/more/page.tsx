import { PageTransition } from "@/components/dashboard/page-transition";

import { MoreHub } from "./more-hub";

export const dynamic = "force-dynamic";

/**
 * 「⚙️ 更多功能」大廳 — More Hub pattern。
 *
 * 行動版底部 tab bar 第 5 格的目的地。從這裡再分流到夢想 / 設定 兩個
 * 低頻功能，避免「6 個 tab 擠成糊狀」的觸控災難又不犧牲功能對等。
 *
 * 桌面如果意外打開（直接打 URL），MoreHub 內部 useEffect 偵測 viewport
 * 自動 router.replace("/settings") — 桌面 sidebar 有直接連結兩個目的地，
 * 沒理由停在大廳中轉頁。
 */
export default function MorePage() {
  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-2xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
        <MoreHub />
      </main>
    </PageTransition>
  );
}
