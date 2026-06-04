"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, Loader2Icon, PartyPopper, Pencil } from "lucide-react";
import { toast } from "sonner";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { updateTransaction } from "@/lib/actions/transactions";
import { formatCurrency } from "@/lib/dashboard";
import { triggerHaptic } from "@/lib/haptics";
import type { PlaceholderTransaction } from "@/lib/load-placeholders";
import { cn } from "@/lib/utils";

interface Props {
  placeholders: PlaceholderTransaction[];
}

/**
 * 通知中心鈴鐺 — 仿 Linear 風格固定右上角浮動，列出本月所有
 * fulfillment_state='placeholder' 的週期性扣款，提供「inline 改金額 → 即時
 * 核銷」的極致流暢路徑。
 *
 * 資料流：
 *   - placeholders 由 (dashboard)/layout.tsx server-side 預取，跨頁切換時
 *     RSC 重抓自動同步。
 *   - 確認一筆 → updateTransaction({ fulfillmentState: 'confirmed' }) →
 *     server action 內 revalidatePath('/') → RSC 重抓 → 下次 mount 不會
 *     再出現。本地立刻把該 id 從 confirmedIds set 算進去，AnimatePresence
 *     觸發 slide-out 動畫，等動畫完才走 router.refresh()。
 *
 * 為什麼用 fixed 浮動而非塞 sidebar header：
 *   - 現有 desktop sidebar header 已被 logo + collapse toggle 塞滿（w-20
 *     摺疊時更擠），多塞一個 Bell 視覺很亂。
 *   - Mobile 走 floating 邏輯本來就一致（PrivacyToggle / ThemeToggle 同位置）。
 *   - 浮動鈴鐺跨 viewport 行為一致，不需要 desktop / mobile 雙寫。
 *
 * 位置：fixed top-3 right-3 z-30 — 跟既有 mobile floating toolbar 同 zone，
 * 桌面 viewport 也常駐右上、不擋 sidebar。
 */
export function RecurringBell({ placeholders }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // 已經被使用者點 ✓ confirm 的 id；用來在 AnimatePresence 把該 row 滑出去。
  // server revalidate 完之後下次 RSC 重抓 placeholders 就會少這筆，set 自然
  // 對齊；不需手動同步。
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());

  // 顯示中的列表 = 後端傳來的 placeholders 減去本地已 confirm 的（給 AnimatePresence 過渡）
  const visible = placeholders.filter((p) => !confirmedIds.has(p.id));
  const visibleCount = visible.length;
  const hasPlaceholders = visibleCount > 0;

  function handleConfirm(p: PlaceholderTransaction, newAmount: number) {
    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      toast.error("金額必須為大於 0 的數字");
      return;
    }
    // 沉穩成功觸感 — 點下 ✓ 立即震動 20ms，給「動作已被系統接收」的物理回饋
    triggerHaptic("success");
    // 樂觀更新：先把 id 加進 confirmedIds 觸發 slide-out 動畫，
    // server 失敗時再從 set 拿掉並 toast 錯誤回滾視覺。
    setConfirmedIds((prev) => new Set(prev).add(p.id));
    startTransition(async () => {
      const result = await updateTransaction({
        id: p.id,
        description: p.description,
        amount: newAmount,
        fulfillmentState: "confirmed",
      });
      if (!result.ok) {
        setConfirmedIds((prev) => {
          const next = new Set(prev);
          next.delete(p.id);
          return next;
        });
        toast.error("核銷失敗", { description: result.error });
        return;
      }
      const deltaHint =
        newAmount !== p.amount
          ? `（預估 ${formatCurrency(p.amount)} → 實付 ${formatCurrency(newAmount)}）`
          : "";
      toast.success("已核銷週期", {
        description: `${p.description}${deltaHint}`,
      });
      // 等動畫跑完再 revalidate，避免下次 placeholders 重抓導致 AnimatePresence
      // 把 row 從「未在新清單」當作直接卸載（沒滑出動畫）。
      window.setTimeout(() => router.refresh(), 350);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={
          hasPlaceholders
            ? `週期通知，${visibleCount} 筆待確認`
            : "週期通知"
        }
        className="fixed top-3 right-3 z-30 grid size-10 place-items-center rounded-full bg-background/80 text-foreground ring-1 ring-foreground/15 shadow-sm backdrop-blur-md transition-colors hover:bg-background hover:ring-foreground/30 md:right-5 md:top-4"
      >
        <Bell className="size-4" />
        {/* 呼吸燈圓點 — 有待確認時才渲染，amber-500 + animate-pulse */}
        {hasPlaceholders && (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-500 animate-pulse ring-2 ring-background"
          />
        )}
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={12}
        className="w-[min(22rem,calc(100vw-1.5rem))] p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Bell className="size-4 text-amber-500" />
            週期性收支待確認
          </p>
          {hasPlaceholders && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500 ring-1 ring-amber-500/20 tabular-nums">
              {visibleCount} 筆
            </span>
          )}
        </div>

        {/* Body：空狀態或列表 */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {hasPlaceholders ? (
            <ul className="flex flex-col gap-1">
              <AnimatePresence mode="popLayout" initial={false}>
                {visible.map((p) => (
                  <motion.li
                    key={p.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -80, transition: { duration: 0.25 } }}
                    transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  >
                    <PlaceholderRow
                      placeholder={p}
                      pending={pending}
                      onConfirm={(amount) => handleConfirm(p, amount)}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Footer hint — 待確認時才出，提示使用者可以 inline 改金額 */}
        {hasPlaceholders && (
          <div className="border-t border-zinc-800 px-4 py-2.5 text-[11px] leading-relaxed text-zinc-500">
            💡 直接在輸入框改金額，按 <Check className="inline size-3 align-text-bottom text-emerald-400" /> 即可核銷
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ─────────────────── Row 元件 ─────────────────── */

interface RowProps {
  placeholder: PlaceholderTransaction;
  pending: boolean;
  onConfirm: (amount: number) => void;
}

function PlaceholderRow({ placeholder, pending, onConfirm }: RowProps) {
  const [draft, setDraft] = useState(String(placeholder.amount));
  const [editing, setEditing] = useState(false);

  const parsed = Number.parseFloat(draft);
  const changed =
    Number.isFinite(parsed) && parsed > 0 && parsed !== placeholder.amount;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onConfirm(parsed);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="group flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-zinc-900/60"
    >
      {/* 左：title + 日期 */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-100">
          {placeholder.description}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-zinc-500 tabular-nums">
          {formatDate(placeholder.date)} · 預估 {formatCurrency(placeholder.amount)}
        </p>
      </div>

      {/* 右：金額輸入 + 確認 + 切編輯 */}
      <div className="flex items-center gap-1">
        <input
          inputMode="decimal"
          type="number"
          step="1"
          min="1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          disabled={pending}
          className={cn(
            "w-20 rounded-md bg-zinc-900/80 px-2 py-1 text-right text-xs tabular-nums text-zinc-100 ring-1 ring-zinc-800 outline-none transition-colors focus:ring-amber-500/40",
            changed && "ring-amber-500/40"
          )}
          aria-label={`${placeholder.description} 金額`}
        />
        {/* ✓ confirm */}
        <button
          type="submit"
          disabled={pending}
          aria-label="確認核銷"
          className="grid size-7 place-items-center rounded-md text-emerald-400 ring-1 ring-emerald-500/30 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" strokeWidth={3} />
          )}
        </button>
        {/* ✎ edit-focus：聚焦到 input + 全選便於改金額。
            視覺上跟 ✓ 並排成「兩顆動作鈕」對齊使用者 spec 期待。 */}
        <button
          type="button"
          aria-label="編輯金額"
          onClick={(e) => {
            const input = (
              e.currentTarget.closest("form") as HTMLFormElement | null
            )?.querySelector("input");
            input?.focus();
            input?.select();
          }}
          disabled={pending}
          className={cn(
            "grid size-7 place-items-center rounded-md text-zinc-400 ring-1 ring-zinc-800 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40",
            editing && "ring-amber-500/40 text-amber-400"
          )}
        >
          <Pencil className="size-3" strokeWidth={2.5} />
        </button>
      </div>
    </form>
  );
}

/* ─────────────────── 空狀態 ─────────────────── */

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <PartyPopper className="size-9 text-emerald-400" strokeWidth={1.5} />
      <p className="text-sm font-medium text-emerald-300">
        🎉 太棒了！
      </p>
      <p className="text-xs leading-relaxed text-zinc-400">
        本月週期性開銷已全數核實完畢
      </p>
    </div>
  );
}

/* ─────────────────── helpers ─────────────────── */

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  if (!m || !d) return iso;
  return `${m}/${d}`;
}
