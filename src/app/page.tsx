import Link from "next/link";
import { AlertTriangle, CalendarClock, TrendingUp } from "lucide-react";

import { AccountSwitcher } from "@/components/dashboard/account-switcher";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { BoardCard } from "@/components/dashboard/board-card";
import { CashflowLineChart } from "@/components/dashboard/cashflow-line-chart";
import { ForecastDetailAccordion } from "@/components/dashboard/forecast-detail-accordion";
import { GoalSummaryLink } from "@/components/dashboard/goal-summary-link";
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
  formatCurrency,
  num,
  scopeForAccount,
  BOARDS,
} from "@/lib/dashboard";
import { loadDashboard } from "@/lib/load-dashboard";
import { loadGoals } from "@/lib/goals";
import { loadSubscriptions } from "@/lib/subscriptions";
import { loadSystemSettings } from "@/lib/system-settings";

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
  ] = await Promise.all([
    loadDashboard(),
    loadSystemSettings(),
    loadSubscriptions(),
    loadGoals(),
  ]);

  // 三大板塊：用真實當下；歷史月份切換已搬到 /analytics
  const boardData = buildBoardData({ accounts, recurring, transactions, now });
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
      {/* Header */}
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Money Radar
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            個人財務戰情室
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground md:max-w-none md:whitespace-nowrap">
            {user?.name ? `${user.name}，` : ""}
            採用「分離帳戶理財法」追蹤
            <span className="mx-1 font-medium text-foreground">個人 / 家庭 / 補助</span>
            三個獨立板塊的本月預算與實際開銷。
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <TodayBadge />
          <div className="flex flex-wrap items-center gap-2 sm:flex-row-reverse">
            <QuickAddTransaction
              userId={user?.id ?? null}
              accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
            />
            <Link
              href="/recurring"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "gap-1.5 rounded-full",
              })}
            >
              <CalendarClock className="size-4" />
              週期性收支
            </Link>
          </div>
        </div>
      </header>

      {/* AI 智慧預警 */}
      {breach && (
        <Alert
          variant="destructive"
          className="mb-6 gap-x-3 gap-y-1.5 border-rose-500/30 bg-rose-500/[0.04] px-6 py-4 ring-1 ring-rose-500/20"
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
          <AlertDescription className="leading-relaxed">
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

      {/* 訂閱扣款警報：≤7 天才出現，否則完全隱藏（return null）*/}
      <SubscriptionAlertWidget
        subscriptions={subscriptions}
        accounts={accounts}
      />

      {/* 三大板塊 — Desktop */}
      <section
        aria-label="三大財務板塊"
        className="hidden grid-cols-1 gap-4 md:grid lg:grid-cols-3"
      >
        {BOARDS.map((b) => (
          <BoardCard
            key={b.key}
            data={boardData[b.key]}
            allAccounts={accounts}
          />
        ))}
      </section>

      {/* 三大板塊 — Mobile */}
      <section aria-label="三大財務板塊（手機版）" className="md:hidden">
        <Tabs defaultValue="family" className="gap-6">
          <TabsList className="mb-2 grid w-full grid-cols-3">
            {BOARDS.map((b) => (
              <TabsTrigger key={b.key} value={b.key} className="gap-1.5">
                <span aria-hidden>{b.emoji}</span>
                <span>
                  {b.key === "family"
                    ? "家庭"
                    : b.key === "subsidy"
                      ? "補助"
                      : "個人"}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {BOARDS.map((b) => (
            <TabsContent key={b.key} value={b.key}>
              <BoardCard data={boardData[b.key]} allAccounts={accounts} />
            </TabsContent>
          ))}
        </Tabs>
      </section>

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
    </PageTransition>
  );
}
