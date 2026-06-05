import { Settings } from "lucide-react";

import { AccountsCard } from "@/components/dashboard/accounts-card";
import { CategoriesCard } from "@/components/dashboard/categories-card";
import { DashboardPlatesCard } from "@/components/dashboard/dashboard-plates-card";
import { LineBindingCard } from "@/components/dashboard/line-binding-card";
import { PageTransition } from "@/components/dashboard/page-transition";
import { ProfileSettingsCard } from "@/components/dashboard/profile-settings-card";
import { SeedDemoButton } from "@/components/dashboard/seed-demo-button";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { SubscriptionsCard } from "@/components/dashboard/subscriptions-card";
import { SystemSettingsForm } from "@/components/dashboard/system-settings-form";
import { loadCategories } from "@/lib/load-categories";
import { loadDashboard } from "@/lib/load-dashboard";
import { loadDashboardPlates } from "@/lib/load-dashboard-plates";
import { loadProfileSettings } from "@/lib/load-profile";
import { loadSubscriptions } from "@/lib/load-subscriptions";
import { createClient } from "@/lib/supabase/server";
import { loadSystemSettings } from "@/lib/load-system-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadLineBinding(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("line_user_id")
    .maybeSingle();
  return (data?.line_user_id as string | null) ?? null;
}

export default async function SettingsPage() {
  const [
    settings,
    subscriptions,
    { accounts },
    lineUserId,
    categories,
    plates,
    profile,
  ] = await Promise.all([
    loadSystemSettings(),
    loadSubscriptions(),
    loadDashboard(),
    loadLineBinding(),
    loadCategories(),
    loadDashboardPlates(),
    loadProfileSettings(),
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

        {/* 👤 個人設定 — 暱稱會回流首頁歡迎詞、儲蓄率目標會畫進分析趨勢圖 */}
        <ProfileSettingsCard initial={profile} accounts={accounts} />

        <SystemSettingsForm initial={settings} />

        {/* 🧱 戰情室板塊配置 — 取代寫死的 BoardKey enum；首頁未來會吃這份 */}
        <DashboardPlatesCard plates={plates} accounts={accounts} />

        {/* 💼 帳戶管理中樞 — CRUD + 資產校正水位（per spec：首頁移除鉛筆鈕後的家） */}
        <AccountsCard accounts={accounts} />

        {/* 🎨 分類管理 — 動態取代靜態 EXPENSE_CATEGORY_*；改顏色 / 名稱會即時連動圖表 */}
        <CategoriesCard categories={categories} accounts={accounts} plates={plates} />

        {/* LINE 綁定區塊 — 多租戶版才有，把 LINE userId 寫進 profiles */}
        <LineBindingCard currentLineUserId={lineUserId} />

        {/* 🗓️ 固定扣款與訂閱管理 */}
        <SubscriptionsCard
          subscriptions={subscriptions}
          accounts={accounts}
        />

        {/* 帳號操作 — 行動裝置上 sidebar 看不到，這邊也放一份 */}
        <div className="mt-8 flex justify-center md:hidden">
          <SignOutButton className="rounded-full ring-1 ring-foreground/10" />
        </div>

        {/*
          ⚡ Demo 種子按鈕 — 「開箱即用體驗」的最後一哩路。
          env gate 不過時 SeedDemoButton 內部直接 return null，正式環境
          不會看到。要在 fork production 啟用：設 NEXT_PUBLIC_ENABLE_DEMO_SEED=true。
        */}
        <SeedDemoButton />
      </main>
    </PageTransition>
  );
}
