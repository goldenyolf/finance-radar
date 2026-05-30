import Link from "next/link";
import { AlertTriangle, CalendarClock, TrendingUp } from "lucide-react";

import { AccountSwitcher } from "@/components/dashboard/account-switcher";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { BoardCard } from "@/components/dashboard/board-card";
import { CashflowLineChart } from "@/components/dashboard/cashflow-line-chart";
import { ForecastDetailAccordion } from "@/components/dashboard/forecast-detail-accordion";
import { GoalSummaryLink } from "@/components/dashboard/goal-summary-link";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { OnboardingDialog } from "@/components/dashboard/onboarding-dialog";
import { PageTransition } from "@/components/dashboard/page-transition";
import { QuickAddTransaction } from "@/components/dashboard/quick-add-transaction";
import { SubscriptionAlertWidget } from "@/components/dashboard/subscription-alert-widget";
import { TodayBadge } from "@/components/dashboard/today-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  availableCash,
  buildBoardData,
  computeForecast,
  num,
  scopeForAccount,
} from "@/lib/dashboard";
import { loadCategories } from "@/lib/load-categories";
import { loadDashboard } from "@/lib/load-dashboard";
import { loadDashboardPlates } from "@/lib/load-dashboard-plates";
import { loadGoals } from "@/lib/load-goals";
import { loadOnboardingCompleted } from "@/lib/load-onboarding";
import { loadOnboardingProgress } from "@/lib/load-onboarding-progress";
import { loadProfileSettings } from "@/lib/load-profile";
import { loadSubscriptions } from "@/lib/load-subscriptions";
import { loadSystemSettings } from "@/lib/load-system-settings";

// 時間感知：強制每次請求都重跑 RSC，讓 new Date() 真的拿到當下時間
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ account?: string }>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const { account: accountParam } = await searchParams;
  const now = new Date();
  const [
    { user, assets, debts, recurring, transactions, accounts },
    settings,
    subscriptions,
    goals,
    categories,
    plates,
    onboardingCompleted,
    onboardingProgress,
    profile,
  ] = await Promise.all([
    loadDashboard(),
    loadSystemSettings(),
    loadSubscriptions(),
    loadGoals(),
    loadCategories(),
    loadDashboardPlates(),
    loadOnboardingCompleted(),
    loadOnboardingProgress(),
    loadProfileSettings(),
  ]);

  // 板塊：使用者自訂（dashboard_plates）；用真實當下；歷史月份切換在 /analytics
  const boardData = buildBoardData({
    plates,
    accounts,
    recurring,
    transactions,
    now,
  });
  const threshold =
    settings.safetyThreshold ??
    (user ? num(user.emergency_fund_threshold) : 0);

  const activeAccountId =
    accountParam && accounts.some((a) => a.id === accountParam)
      ? accountParam
      : null;
  const forecastScope = scopeForAccount(
    { accounts, transactions, recurring, assets, debts },
    activeAccountId
  );
  const activeAccountName = activeAccountId
    ? (accounts.find((a) => a.id === activeAccountId)?.name ?? "")
    : null;

  const startingCash = availableCash(
    forecastScope.assets,
    forecastScope.accounts
  );
  const forecastPoints = computeForecast({
    startingCash,
    recurring: forecastScope.recurring,
    upcoming: forecastScope.transactions,
    months: 8,
    now,
  });

  const safetyFloor = threshold > 0 ? threshold : 0;
  const breach = forecastPoints.find((p) => p.cash < safetyFloor);

  return (
    <PageTransition>
    <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
      {/*
        🪜 新手任務清單 — 擺在 header 之上的最頂部，3 任務全達標時元件
        return null 自動消失。已綁 LINE / 配過板塊 / 拍過快照的老用戶
        永遠看不到，零干擾。
      */}
      <OnboardingChecklist progress={onboardingProgress} />

      {/* Header */}
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Money Radar
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {profile.display_name
              ? `👋 歡迎回來，${profile.display_name}！`
              : "👋 歡迎回來！"}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground md:max-w-none md:whitespace-nowrap">
            採用「分離帳戶理財法」追蹤
            <span className="mx-1 font-medium text-foreground">個人 / 家庭 / 補助</span>
            三個獨立板塊的本月預算與實際開銷。
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <TodayBadge />
          <div className="flex flex-wrap items-center gap-2 sm:flex-row-reverse">
            <QuickAddTransaction
              accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
            />
            {/* 週期性收支入口：行動版只露 icon（min 44x44 觸控標準），sm+ 才顯示文字 pill */}
            <Link
              href="/recurring"
              aria-label="週期性收支"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className:
                  "h-11 min-w-11 gap-1.5 rounded-full px-0 sm:px-4",
              })}
            >
              <CalendarClock className="size-5 sm:size-4" />
              <span className="sr-only sm:not-sr-only">週期性收支</span>
            </Link>
          </div>
        </div>
      </header>

      {/* AI 智慧預警 */}
      {breach && (
        <Alert
          variant="destructive"
          className="mb-6 gap-x-3 gap-y-1.5 border-rose-500/30 bg-rose-500/[0.04] px-4 py-4 ring-1 ring-rose-500/20 md:px-6"
        >
          <AlertTriangle />
          <AlertTitle className="font-semibold">
            ⚠️ 資金缺口預警
            {activeAccountName && (
              <span className="ml-2 text-xs font-normal text-destructive/70">
                · 檢視範圍：{activeAccountName}
              </span>
            )}
          </AlertTitle>
          {/*
            text-pretty 覆蓋 AlertDescription 預設的 text-balance — 後者在窄螢幕
            會把長中文句子強制切成「2026年6月 可用現金 / 預估降至 $99,604，將跌破
            安全 / 門檻 $100,000」這種奇怪等寬斷行。text-pretty 只避免孤字而不
            強行對齊，break-words 防超長數字/英文撐爆容器。
          */}
          <AlertDescription className="text-pretty break-words leading-relaxed">
            {breach.netCashflow < 0 ? (
              <>
                系統偵測到 <strong>{breach.monthLabel}</strong>{" "}
                將有大額支出（預估該月淨流出{" "}
                <strong className="tabular-nums">
                  <AnimatedNumber value={-breach.netCashflow} />
                </strong>
                ），資金池將跌破安全門檻{" "}
                <strong className="tabular-nums">
                  <AnimatedNumber value={safetyFloor} />
                </strong>
                ，請提前準備。
              </>
            ) : (
              <>
                系統偵測到 <strong>{breach.monthLabel}</strong>{" "}
                可用現金預估降至{" "}
                <strong className="tabular-nums">
                  <AnimatedNumber value={breach.cash} />
                </strong>
                ，將跌破安全門檻{" "}
                <strong className="tabular-nums">
                  <AnimatedNumber value={safetyFloor} />
                </strong>
                ，請提前準備。
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* 板塊區（自訂 N 個，最多 4 個 — 沒任何 plate → 引導去 settings 建第一個） */}
      {boardData.length === 0 ? (
        <section
          aria-label="財務板塊"
          className="rounded-xl border border-dashed border-foreground/15 bg-muted/30 px-5 py-10 text-center text-sm"
        >
          <p className="text-muted-foreground">
            還沒設定任何戰情室板塊。
          </p>
          <Link
            href="/settings"
            className="mt-2 inline-flex items-center gap-1 font-medium text-foreground hover:underline"
          >
            到設定頁建立第一個 →
          </Link>
        </section>
      ) : (
        <>
          {/*
            Desktop grid：1 個一欄、2 個兩欄、3+ 個三欄（4 個就 3+1 wrap）。
            動態 className 但只用有限集合（1/2/3），Tailwind 編譯期會保留全部。
          */}
          <section
            aria-label="財務板塊"
            className={`hidden gap-4 md:grid ${
              boardData.length === 1
                ? "grid-cols-1"
                : boardData.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-1 lg:grid-cols-3"
            }`}
          >
            {boardData.map((b) => (
              <BoardCard
                key={b.meta.plateId}
                data={b}
                allAccounts={accounts}
                categories={categories}
              />
            ))}
          </section>

          {/* Mobile Tabs：每塊一個 tab；TabsList 動態 grid-cols 1-4 */}
          <section aria-label="財務板塊（手機版）" className="md:hidden">
            <Tabs defaultValue={boardData[0].meta.plateId} className="gap-6">
              <TabsList
                className={`mb-2 grid w-full ${
                  boardData.length === 1
                    ? "grid-cols-1"
                    : boardData.length === 2
                      ? "grid-cols-2"
                      : boardData.length === 3
                        ? "grid-cols-3"
                        : "grid-cols-4"
                }`}
              >
                {boardData.map((b) => (
                  <TabsTrigger
                    key={b.meta.plateId}
                    value={b.meta.plateId}
                    className="gap-1.5"
                  >
                    <span aria-hidden>{b.meta.emoji}</span>
                    <span>{b.meta.shortLabel}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {boardData.map((b) => (
                <TabsContent key={b.meta.plateId} value={b.meta.plateId}>
                  <BoardCard
                    data={b}
                    allAccounts={accounts}
                    categories={categories}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </section>
        </>
      )}

      {/* 訂閱扣款警報：≤7 天才出現，否則完全隱藏（return null）*/}
      <SubscriptionAlertWidget
        subscriptions={subscriptions}
        accounts={accounts}
      />

      {/* 夢想基金：首頁只放微型版，完整管理在 /goals */}
      <GoalSummaryLink goals={goals} />

      {/* 趨勢預測 (supplementary) */}
      <section className="mt-8">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">
                    未來 8 個月現金流預測
                  </CardTitle>
                </div>
                <CardDescription className="mt-1">
                  {activeAccountName
                    ? `僅檢視「${activeAccountName}」的現金、綁定的固定收支與未來預計交易。`
                    : "結合所有帳戶的目前現金、固定收支與未來預計交易。"}
                  紅色虛線為安全準備金門檻。
                </CardDescription>
              </div>
              <AccountSwitcher
                accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
                active={activeAccountId}
              />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="-mx-2 overflow-x-auto px-2 md:mx-0 md:overflow-x-visible md:px-0">
              <div className="min-w-[560px] md:min-w-0">
                <CashflowLineChart
                  data={forecastPoints}
                  threshold={threshold || undefined}
                />
              </div>
            </div>
            <div className="border-t border-foreground/10 pt-2">
              <h3 className="px-1 pb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                未來金流明細
                {activeAccountName && (
                  <span className="ml-2 normal-case tracking-normal text-foreground/70">
                    · {activeAccountName}
                  </span>
                )}
              </h3>
              <ForecastDetailAccordion points={forecastPoints} />
            </div>
          </CardContent>
        </Card>
      </section>
    </main>

    {/*
      新手引導：has_completed_onboarding=false 才掛進來，所以 OnboardingDialog
      不用自己判斷狀態。掛在 PageTransition 內，但 Dialog 自己 portal 到
      document.body，不會被 PageTransition 的 transform stacking context 困住。
    */}
    {!onboardingCompleted && <OnboardingDialog />}
    </PageTransition>
  );
}
