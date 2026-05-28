import { CalendarClock, Wallet } from "lucide-react";

import { AssetAllocationCard } from "@/components/dashboard/asset-allocation-card";
import { NetWorthCards } from "@/components/dashboard/net-worth-cards";
import { NetWorthTrendChart } from "@/components/dashboard/net-worth-trend-chart";
import { PageTransition } from "@/components/dashboard/page-transition";
import { UpdateSnapshotDialog } from "@/components/dashboard/update-snapshot-dialog";
import { WealthAccountsList } from "@/components/dashboard/wealth-accounts-list";
import { HelpTip } from "@/components/ui/help-tip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadWealth } from "@/lib/load-wealth";
import {
  buildDisplayAccounts,
  latestSnapshot,
  snapshotsToTrendPoints,
} from "@/lib/wealth";

export const dynamic = "force-dynamic";

/**
 * 淨資產戰情室。
 *
 * 資料源：wealth_accounts（帳戶清單）+ wealth_snapshots（月度快照歷史）。
 *  - 三大數據卡走最新一張快照
 *  - 趨勢圖走全部快照（DESC → ASC 在 wealth.ts 處理）
 *  - 帳戶清單走 wealth_accounts，最新快照沒對到的 value 顯示 "—"
 *
 * Phase 4 會在 header 接「📸 更新本月資產快照」Dialog；現在先空著版位。
 */
export default async function NetWorthPage() {
  const { accounts, snapshots } = await loadWealth();
  const latest = latestSnapshot(snapshots);
  // snapshots 是 DESC（最新在前），所以 [1] 就是「前一筆」給 MoM 用
  const previous = snapshots[1] ?? null;
  const trendPoints = snapshotsToTrendPoints(snapshots);
  const displayAccounts = buildDisplayAccounts(accounts, latest);

  const lastUpdated = latest?.recorded_at
    ? formatRecordedAt(latest.recorded_at)
    : null;

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-4xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Net Worth
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              <Wallet className="size-7 text-muted-foreground" />
              淨資產戰情室
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              每月底手動更新一次各帳戶殘值，系統幫你串成淨資產趨勢線。
              這是低頻的「資產存量」視角，跟首頁的「現金流量」分開看。
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {lastUpdated && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" />
                最近快照：{lastUpdated}
              </span>
            )}
            <div className="flex items-center gap-2">
              <UpdateSnapshotDialog accounts={accounts} latest={latest} />
              <HelpTip ariaLabel="資產快照說明" side="bottom">
                📸 財富覆盤小常識：這是一個低頻高價值的空間。建議在每個月的最後一天（發薪後、繳完主要帳單時），手動填入當下各帳戶/負債的真實殘值。持續半年，即可解鎖精準的資產爬升面積圖。
              </HelpTip>
            </div>
          </div>
        </header>

        {/* 三大數據卡（含 MoM 增長率 badge） */}
        <div className="mb-6">
          <NetWorthCards latest={latest} previous={previous} />
        </div>

        {/*
          趨勢圖 + 資產配置：桌面 lg+ 並排（兩張卡平分寬度），mobile/tablet
          直向堆疊。並排時兩張卡都會稍微變窄，但 trend 6 點 / pie 圓餅都還
          看得清楚；換來「一掃就同時看見走勢 + 配置」的 dashboard 感。
        */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">📈 淨資產趨勢</CardTitle>
              <CardDescription>
                每月一筆，連起來看財富累積曲線。前期空白屬正常 — 從第一張快照開始才有資料。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NetWorthTrendChart data={trendPoints} />
            </CardContent>
          </Card>

          <AssetAllocationCard latest={latest} />
        </div>

        {/* 資產 / 負債清單 */}
        <WealthAccountsList accounts={displayAccounts} />
      </main>
    </PageTransition>
  );
}

function formatRecordedAt(iso: string): string {
  // "2026-05-31" → "2026/05/31"
  return iso.replaceAll("-", "/");
}
