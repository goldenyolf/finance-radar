"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  LayoutGrid,
  Tags,
} from "lucide-react";

import type { OnboardingProgress } from "@/lib/load-onboarding-progress";

interface Props {
  progress: OnboardingProgress;
}

const TOTAL_TASKS = 3;
const LS_KEY_CATEGORIES_VISITED = "money-radar:onboarding-categories-visited";

/**
 * 🪜 矽谷風新手任務清單（升級版）。
 *
 * 三任務：
 *   1. 🧱 板塊配置 — server-side：dashboard_plates 有 row 就勾（seed 完一定有）
 *   2. 🏷️ 分類管理 — client-side：使用者點過 [前往配置] 就 LS 標記
 *   3. 📸 資產快照 — server-side：wealth_snapshots 有 row 就勾
 *
 * 為什麼是 client component：task 2 走 LocalStorage（純前端狀態），
 * 沒辦法在 RSC 預判。tasks 1 / 3 從 props 拿，task 2 從 LS 讀。
 *
 * 防窺模式：當前 3 任務文案無金額，零工。將來加金額提示時用 <Money> 包就 OK。
 *
 * 全完成淡出：用 `opacity-0 -translate-y-2 pointer-events-none` 配
 * `transition-all duration-500` 做 CSS 過渡，500ms 後 setState 真正 unmount。
 */
export function OnboardingChecklist({ progress }: Props) {
  const [mounted, setMounted] = useState(false);
  const [hasVisitedCategories, setHasVisitedCategories] = useState(false);
  const [unmounted, setUnmounted] = useState(false);

  useEffect(() => {
    try {
      setHasVisitedCategories(
        window.localStorage.getItem(LS_KEY_CATEGORIES_VISITED) === "1"
      );
    } catch {
      // localStorage 不可用（隱私模式 / SSR）→ 預設未訪問
    }
    setMounted(true);
  }, []);

  const done =
    (progress.hasPlates ? 1 : 0) +
    (hasVisitedCategories ? 1 : 0) +
    (progress.hasSnapshot ? 1 : 0);

  // 3/3 → 開始淡出，500ms 後真正 unmount（讓 transition 跑完）
  useEffect(() => {
    if (done >= TOTAL_TASKS) {
      const t = window.setTimeout(() => setUnmounted(true), 520);
      return () => window.clearTimeout(t);
    }
  }, [done]);

  if (!mounted) return null; // SSR / hydration 對齊 — LS 還沒讀
  if (unmounted) return null;

  const percent = Math.round((done / TOTAL_TASKS) * 100);
  const isAllDone = done >= TOTAL_TASKS;

  function markCategoriesVisited() {
    try {
      window.localStorage.setItem(LS_KEY_CATEGORIES_VISITED, "1");
    } catch {
      // 同上，失敗忽略
    }
    setHasVisitedCategories(true);
  }

  return (
    <section
      aria-label="新手任務清單"
      className={`mb-8 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-5 backdrop-blur-md transition-all duration-500 sm:p-6 ${
        isAllDone
          ? "pointer-events-none -translate-y-2 opacity-0"
          : "opacity-100"
      }`}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex items-center gap-4 sm:flex-col sm:items-center sm:gap-2">
          <CircularProgress done={done} percent={percent} />
          <div className="sm:text-center">
            <p className="text-sm font-semibold">解鎖戰情室能力</p>
            <p className="text-[11px] text-muted-foreground">
              完成 3 項任務即可隱藏這張卡
            </p>
          </div>
        </div>

        <ul className="flex flex-1 flex-col gap-2">
          <TaskRow
            done={progress.hasPlates}
            icon={<LayoutGrid className="size-4" />}
            label="🧱 調整戰情室板塊配置"
            hint="打造完全配合你生活型態的看板"
            href="/settings"
            cta="前往自訂"
          />
          <TaskRow
            done={hasVisitedCategories}
            icon={<Tags className="size-4" />}
            label="🏷️ 劃分固定與浮動分類"
            hint="定義死錢 vs 活錢，解鎖硬性負擔率與財富智囊預警"
            href="/settings"
            cta="前往配置"
            onClickCta={markCategoriesVisited}
          />
          <TaskRow
            done={progress.hasSnapshot}
            icon={<Camera className="size-4" />}
            label="📸 記錄你的財富起跑點"
            hint="拍下第一張資產負債快照，點亮淨資產面積圖"
            href="/net-worth"
            cta="去拍照"
          />
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────── 環形進度 ─────────────────── */

function CircularProgress({ done, percent }: { done: number; percent: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  // tier 配色：0 / 1 / 2 / 3 各對應不同色階
  const indicatorClass =
    done === 0
      ? "text-foreground/25"
      : done === 1
        ? "text-amber-500"
        : done === 2
          ? "text-blue-500"
          : "text-emerald-500";

  return (
    <div className="relative grid size-16 shrink-0 place-items-center">
      <svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        className="absolute inset-0 -rotate-90"
        aria-hidden
      >
        <circle
          cx="32"
          cy="32"
          r={radius}
          stroke="currentColor"
          strokeWidth="5"
          fill="none"
          className="text-foreground/10"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          stroke="currentColor"
          strokeWidth="5"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${indicatorClass} transition-all duration-500`}
        />
      </svg>
      <div className="relative flex flex-col items-center leading-none">
        <span className="text-sm font-semibold tabular-nums">
          {done}
          <span className="text-muted-foreground/60">/{TOTAL_TASKS}</span>
        </span>
      </div>
    </div>
  );
}

/* ─────────────────── 單一任務 row ─────────────────── */

interface TaskRowProps {
  done: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  href: string;
  cta: string;
  /** 點 CTA 時觸發；多半用來 set LocalStorage 標記任務完成（task 2 用）*/
  onClickCta?: () => void;
}

function TaskRow({
  done,
  icon,
  label,
  hint,
  href,
  cta,
  onClickCta,
}: TaskRowProps) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-foreground/[0.04]">
      <span className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full transition-colors ${
            done
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-foreground/[0.06] text-muted-foreground"
          }`}
        >
          {done ? <Check className="size-4" strokeWidth={3} /> : icon}
        </span>
        <div className="min-w-0">
          <p
            className={`truncate text-sm ${
              done
                ? "text-muted-foreground line-through decoration-emerald-400/40"
                : "font-medium"
            }`}
          >
            {label}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
            {hint}
          </p>
        </div>
      </span>

      {/*
        Task 1（板塊）即使預設勾上，使用者仍可能想去微調 → 給「微調 →」二級
        link；其他完成的任務隱藏 CTA 避免礙眼。
      */}
      {done ? (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 self-center text-[11px] text-muted-foreground hover:text-foreground"
        >
          微調
          <ArrowRight className="size-3" />
        </Link>
      ) : (
        <Link
          href={href}
          onClick={onClickCta}
          className="inline-flex shrink-0 items-center gap-1 self-center rounded-full bg-foreground/[0.04] px-3 py-1 text-xs font-medium transition-colors hover:bg-foreground/[0.08]"
        >
          {cta}
          <ArrowRight className="size-3" />
        </Link>
      )}
    </li>
  );
}
