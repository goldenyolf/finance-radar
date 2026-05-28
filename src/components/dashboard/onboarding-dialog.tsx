"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  Loader2Icon,
  Rocket,
  Tags,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { completeOnboarding } from "@/lib/actions/onboarding";

/**
 * 🚀 新手引導 wizard — 3 步驟。
 *
 * 由 RSC parent 條件 mount（has_completed_onboarding === false 才掛進來），
 * 所以這支元件啟動就 open=true 不用判斷。
 *
 * 退出邏輯：任何方式關閉（背景點擊 / 跳過 / 完成）都會打 server action
 * 翻 has_completed_onboarding=true，避免「按 X 假裝沒看到」下次又彈。
 * 唯一例外：pending 中不接受關閉（避免使用者連點 race）。
 *
 * 跟 EditRecurringDialog 同款 controlled open + 純 Button onClick 模式，
 * 避開 base-ui 1.5 DialogTrigger 地雷（memory）。
 */
export function OnboardingDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  const totalSteps = 3;
  const isFirst = step === 0;
  const isLast = step === totalSteps - 1;

  function finishAndClose() {
    startTransition(async () => {
      const result = await completeOnboarding();
      if (!result.ok) {
        toast.error("儲存進度失敗", { description: result.error });
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (!next) finishAndClose();
  }

  function goNext() {
    if (isLast) {
      finishAndClose();
      return;
    }
    setStep((s) => s + 1);
  }

  function goPrev() {
    if (isFirst) return;
    setStep((s) => s - 1);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">
            👋 歡迎加入 Money Radar
          </DialogTitle>
          <DialogDescription>
            花 30 秒解鎖三個核心能力，體驗才會完整。
          </DialogDescription>
        </DialogHeader>

        <StepIndicator current={step} total={totalSteps} />

        {/* 步驟內容 — 用 key 強制 unmount/mount 觸發 CSS transition；簡單但有效 */}
        <div key={step} className="animate-in fade-in-50 slide-in-from-right-2 duration-200">
          {step === 0 && <StepDefinePlates />}
          {step === 1 && <StepFixedVsVariable />}
          {step === 2 && <StepWealthSnapshot />}
        </div>

        <DialogFooter className="mt-2 flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={finishAndClose}
            disabled={pending}
            className="text-xs text-muted-foreground"
          >
            跳過
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={goPrev}
              disabled={isFirst || pending}
              className="gap-1"
            >
              <ChevronLeft className="size-4" />
              <span className="hidden sm:inline">上一步</span>
            </Button>
            <Button
              type="button"
              onClick={goNext}
              disabled={pending}
              className={
                isLast
                  ? "gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-500 dark:hover:bg-emerald-500/90"
                  : "gap-1"
              }
            >
              {pending ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  儲存中
                </>
              ) : isLast ? (
                <>
                  <Rocket className="size-4" />
                  開啟我的戰情室
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">下一步</span>
                  <span className="sm:hidden">下一步</span>
                  <ChevronRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────── Step Indicator ─────────────────── */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1" aria-label={`步驟 ${current + 1} / ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current
              ? "w-6 bg-foreground"
              : i < current
                ? "w-1.5 bg-foreground/60"
                : "w-1.5 bg-foreground/15"
          }`}
        />
      ))}
    </div>
  );
}

/* ─────────────────── Step 1：定義財務世界（板塊預覽）─────────────────── */

function StepDefinePlates() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <LayoutGrid className="size-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold">🧱 步驟一：定義你的財務世界</h3>
          <p className="text-xs text-muted-foreground">首頁板塊可以隨時增刪、改名、綁定實體銀行帳戶</p>
        </div>
      </div>

      <div className="rounded-xl border border-foreground/5 bg-muted/30 p-4">
        <p className="mb-3 text-xs text-muted-foreground">
          系統已預設幫你建立 3 個獨立板塊：
        </p>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {[
            { emoji: "🏠", label: "家庭" },
            { emoji: "👨‍💼", label: "個人" },
            { emoji: "👶", label: "補助" },
          ].map((p) => (
            <div
              key={p.label}
              className="flex flex-col items-center gap-1.5 rounded-lg bg-card px-2 py-3 ring-1 ring-foreground/5"
            >
              <span className="text-2xl" aria-hidden>{p.emoji}</span>
              <span className="truncate font-medium">{p.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          想新增「投資專戶」「孩子的存錢」之類自訂板塊？到{" "}
          <Link href="/settings" className="font-medium text-foreground underline underline-offset-2">
            設定 → 戰情室板塊配置
          </Link>{" "}
          自由增刪 / 改名 / 綁定銀行帳戶（最多 4 個）。
        </p>
      </div>
    </div>
  );
}

/* ─────────────────── Step 2：固定 vs 浮動分類 ─────────────────── */

function StepFixedVsVariable() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
          <Tags className="size-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold">🏷️ 步驟二：劃分固定與浮動支出</h3>
          <p className="text-xs text-muted-foreground">死錢 vs 活錢 — 理財最關鍵的一刀</p>
        </div>
      </div>

      <div className="rounded-xl border border-foreground/5 bg-muted/30 p-4">
        {/* 對比示意：左固定（slate 死錢）/ 右浮動（amber 活錢） */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2 rounded-lg bg-card p-3 ring-1 ring-slate-500/20">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-full bg-slate-700 dark:bg-slate-400"
              />
              固定 — 死錢
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["房貸", "托育", "保險", "孝親"].map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-500/20 dark:text-slate-300"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg bg-card p-3 ring-1 ring-amber-500/20">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-full bg-amber-500"
              />
              浮動 — 活錢
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["餐飲", "娛樂", "交通", "購物"].map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          到{" "}
          <Link href="/settings" className="font-medium text-foreground underline underline-offset-2">
            分類管理
          </Link>{" "}
          切換每個分類的 <code className="rounded bg-foreground/[0.06] px-1 font-mono text-[10px]">is_fixed</code> 開關，
          解鎖戰情室專屬的{" "}
          <span className="font-medium text-foreground">⚖️ 硬性負擔率</span> 與{" "}
          <span className="font-medium text-foreground">🧙 財富智囊預警</span>。
        </p>
      </div>
    </div>
  );
}

/* ─────────────────── Step 3：拍快照 ─────────────────── */

function StepWealthSnapshot() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Camera className="size-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold">📸 記錄你的財富起跑點</h3>
          <p className="text-xs text-muted-foreground">月度資產快照，追蹤淨資產長期走勢</p>
        </div>
      </div>

      <div className="rounded-xl border border-foreground/5 bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          首頁的板塊看「日常現金流」（薪資、消費）；要看「整體財富累積」
          請到{" "}
          <Link
            href="/net-worth"
            className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2"
          >
            淨資產戰情室
            <ExternalLink className="size-3" />
          </Link>{" "}
          拍下第一張快照（台股、美股、房貸、定存⋯⋯所有 bucket 的當下市值）。
        </p>
        <p className="mt-3 text-[11px] text-muted-foreground">
          💡 建議每月底拍一次，半年後就有清楚的財富爬升曲線可以看。
        </p>
      </div>
    </div>
  );
}
