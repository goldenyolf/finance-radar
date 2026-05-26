import { Settings } from "lucide-react";

import { PageTransition } from "@/components/dashboard/page-transition";
import { SubscriptionsCard } from "@/components/dashboard/subscriptions-card";
import { SystemSettingsForm } from "@/components/dashboard/system-settings-form";
import { loadDashboard } from "@/lib/load-dashboard";
import { loadSubscriptions } from "@/lib/subscriptions";
import { loadSystemSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // 並行載入：settings 給 SystemSettingsForm；subscriptions 給訂閱管理 card；
  // accounts 給訂閱 card 顯示扣款帳戶下拉。
  const [settings, subscriptions, { accounts }] = await Promise.all([
    loadSystemSettings(),
    loadSubscriptions(),
    loadDashboard(),
  ]);

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-4xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
        <header className="mb-8">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Settings
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            <Settings className="size-7 text-muted-foreground" />
            系統設定
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            這裡的設定會跟首頁的資金預警、分析頁的預算進度條、以及 LINE
            記帳警報全部連動。
          </p>
        </header>

        <SystemSettingsForm initial={settings} />

        {/* 🗓️ 固定扣款與訂閱管理 — 從首頁搬過來，CRUD 操作集中在設定頁 */}
        <SubscriptionsCard
          subscriptions={subscriptions}
          accounts={accounts}
        />
      </main>
    </PageTransition>
  );
}
