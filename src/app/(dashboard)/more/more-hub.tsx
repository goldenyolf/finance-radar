"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronRight, Settings2, Target } from "lucide-react";

/**
 * 「⚙️ 更多功能」大廳 — 行動版專屬中轉頁。
 *
 * 桌面 viewport 自動 redirect 到 /settings：md 斷點(768px) 以上代表
 * 使用者用桌面 sidebar，那裡有直接連結，沒理由停在中轉頁。
 *
 * 設計重點：
 *   - 兩張高質感大卡（emerald gradient 夢想 / slate gradient 設定）
 *   - 左側大 emoji + icon bubble、右側 ChevronRight hover 平移
 *   - 整張卡點擊 → 跳目的地，符合 Fitt's law 增加點擊區
 */
export function MoreHub() {
  const router = useRouter();

  // 桌面 viewport 直接送回 /settings — 桌面 sidebar 已有直接連結
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    if (mq.matches) {
      router.replace("/settings");
      return;
    }
    // viewport 從 mobile → desktop（旋轉 / 改視窗大小）也跟著 redirect
    function onChange(e: MediaQueryListEvent) {
      if (e.matches) router.replace("/settings");
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [router]);

  return (
    <>
      <header className="mb-8">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          More
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          ⚙️ 更多功能
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          桌面版可以在左側 sidebar 直接訪問這些功能；行動版我們收進這個大廳避免底部 tab 太擠。
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <HubCard
          href="/goals"
          emoji="🎯"
          title="夢想清單與目標追蹤"
          subtitle="管理你的儲蓄目標、進度追蹤與達成日"
          gradient="from-emerald-500/[0.08] via-emerald-500/[0.04] to-sky-500/[0.04]"
          hoverGradient="hover:from-emerald-500/[0.15] hover:to-sky-500/[0.08]"
          iconBg="bg-emerald-500/15 text-emerald-400"
          icon={<Target className="size-5" />}
        />

        <HubCard
          href="/settings"
          emoji="🔧"
          title="戰情室系統設定"
          subtitle="個人資料、板塊配置、分類管理、訂閱⋯⋯整套設定中心"
          gradient="from-slate-500/[0.08] via-slate-500/[0.04] to-indigo-500/[0.04]"
          hoverGradient="hover:from-slate-500/[0.15] hover:to-indigo-500/[0.08]"
          iconBg="bg-slate-500/15 text-slate-600 dark:text-slate-300"
          icon={<Settings2 className="size-5" />}
        />
      </div>
    </>
  );
}

/* ─────────────────── HubCard ─────────────────── */

interface HubCardProps {
  href: string;
  emoji: string;
  title: string;
  subtitle: string;
  gradient: string;
  hoverGradient: string;
  iconBg: string;
  icon: React.ReactNode;
}

function HubCard({
  href,
  emoji,
  title,
  subtitle,
  gradient,
  hoverGradient,
  iconBg,
  icon,
}: HubCardProps) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-4 rounded-2xl border border-foreground/10 bg-gradient-to-br ${gradient} p-5 transition-all duration-200 hover:border-foreground/20 ${hoverGradient}`}
    >
      <span
        aria-hidden
        className={`relative grid size-14 shrink-0 place-items-center rounded-2xl ring-1 ring-foreground/5 ${iconBg}`}
      >
        <span className="text-2xl leading-none" aria-hidden>
          {emoji}
        </span>
        <span
          aria-hidden
          className="absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full bg-background ring-1 ring-foreground/10"
        >
          {icon}
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      </div>

      <ChevronRight
        aria-hidden
        className="size-5 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-1 group-hover:text-foreground"
      />
    </Link>
  );
}
