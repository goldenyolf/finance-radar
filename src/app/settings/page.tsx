import { Settings } from "lucide-react";

import { LineBindingCard } from "@/components/dashboard/line-binding-card";
import { PageTransition } from "@/components/dashboard/page-transition";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { SubscriptionsCard } from "@/components/dashboard/subscriptions-card";
import { SystemSettingsForm } from "@/components/dashboard/system-settings-form";
import { loadDashboard } from "@/lib/load-dashboard";
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
  const [settings, subscriptions, { accounts }, lineUserId] =
    await Promise.all([
      loadSystemSettings(),
      loadSubscriptions(),
      loadDashboard(),
      loadLineBinding(),
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
      </main>
    </PageTransition>
  );
}
