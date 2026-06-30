"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2Icon, Tag, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { bulkUpdateTransactionProject } from "@/lib/actions/transactions";

interface Props {
  /** 當前已選 transaction id 集合（已過濾為「真的存在於畫面」的 id） */
  selectedIds: string[];
  /** 既有 tag 清單（已去重去空白）— 彈窗 chip 用 */
  availableTags: string[];
  /** 全清空選擇 — 取消鍵 / 成功後呼叫 */
  onClearSelection: () => void;
  /** action 成功 → 父層 router.refresh() */
  onSuccess: () => void;
}

/**
 * 懸浮批次工具列 — 多選 ≥ 1 筆時從底部 spring 滑入。
 *
 * 設計重點:
 *   - createPortal 跳到 document.body，避開父層 PageTransition / motion.div 的
 *     stacking context 困住（同 QuickAdd FAB 的處理）
 *   - 玻璃 bar 走 zinc-950/90 + backdrop-blur-xl，跟 Popover / Tooltip 同款
 *   - 右側「批次歸納專案」走 Popover：3 段 — 既有 tag chips + 新建 input + 清除
 *   - 上限攔在 server 端（500 筆），UI 端只負責 happy path
 *
 * 為什麼不直接做成 inline bar:
 *   表格底端固定 bar = 行動裝置上會被軟鍵盤 / iOS Safari URL bar 吃掉；用
 *   fixed bottom + safe-area-inset 才穩。又因要跳出父層 transform context →
 *   portal 是最少摩擦的選項。
 */
export function BulkProjectTagBar({
  selectedIds,
  availableTags,
  onClearSelection,
  onSuccess,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [pending, startTransition] = useTransition();

  /*
    SSR guard — server 端 document 為 undefined，直接 return null；client 端
    AnimatePresence + selectedIds=[] 初始也只渲染 null，沒 hydration mismatch。
    比起 `useState mounted + useEffect setMounted(true)` 少一輪 re-render，也
    繞開 react-hooks/set-state-in-effect lint。
  */
  const visible = selectedIds.length > 0;

  function applyTag(tag: string | null) {
    if (pending) return;
    startTransition(async () => {
      const result = await bulkUpdateTransactionProject({
        transactionIds: selectedIds,
        projectTag: tag,
      });
      if (!result.ok) {
        toast.error("批次更新失敗", { description: result.error });
        return;
      }
      toast.success(
        tag ? `已批次歸納 ${result.updatedCount} 筆到「${tag}」` : `已清除 ${result.updatedCount} 筆專案標籤`,
        {
          icon: <CheckCircle2 className="size-4 text-emerald-500" />,
        }
      );
      setPickerOpen(false);
      setNewTag("");
      onClearSelection();
      onSuccess();
    });
  }

  function handleApplyNew() {
    const trimmed = newTag.trim();
    if (!trimmed) {
      toast.error("請輸入專案標籤名稱");
      return;
    }
    applyTag(trimmed);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          key="bulk-action-bar"
          initial={{ y: 96, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 96, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 sm:bottom-6"
        >
          <div className="flex w-[min(36rem,calc(100vw-1.5rem))] items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/90 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-2.5">
            {/* 左側：取消 + 計數 */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClearSelection}
              disabled={pending}
              aria-label="取消選取"
              className="shrink-0 text-zinc-400 hover:text-zinc-100"
            >
              <X className="size-4" />
            </Button>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-xs font-medium tracking-wider text-zinc-400 uppercase">
                批次操作
              </span>
              <span className="truncate text-sm font-semibold text-zinc-100">
                已選取{" "}
                <span className="tabular-nums">{selectedIds.length}</span>{" "}
                筆交易
              </span>
            </div>

            {/* 右側：歸納專案 popover */}
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger
                type="button"
                disabled={pending}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background shadow-sm hover:bg-foreground/90 disabled:opacity-50 sm:text-sm"
                aria-label="批次歸納專案"
              >
                {pending ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <Tag className="size-3.5" />
                )}
                <span>批次歸納專案</span>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                sideOffset={10}
                className="w-[min(20rem,calc(100vw-1.5rem))] p-3"
              >
                <div className="flex flex-col gap-3">
                  {/* (1) 既有 tag chips */}
                  {availableTags.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[11px] font-medium tracking-wider text-zinc-400 uppercase">
                        選擇現有專案
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {availableTags.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => applyTag(t)}
                            disabled={pending}
                            className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/50 px-2.5 py-1 text-xs text-zinc-100 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-100 disabled:opacity-50"
                          >
                            <Tag className="size-3" aria-hidden />
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* (2) 新建 tag */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium tracking-wider text-zinc-400 uppercase">
                      新建專案
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="例：太太醫療、新居家電"
                        autoComplete="off"
                        spellCheck={false}
                        disabled={pending}
                        className="flex-1 bg-zinc-900/70"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleApplyNew}
                        disabled={pending || !newTag.trim()}
                      >
                        套用
                      </Button>
                    </div>
                  </div>

                  {/* (3) 清除 — 視覺上 destructive ghost */}
                  <button
                    type="button"
                    onClick={() => applyTag(null)}
                    disabled={pending}
                    className="-mx-1 mt-1 inline-flex items-center justify-center gap-1.5 rounded-md border-t border-zinc-800 px-2 pt-3 text-xs text-zinc-400 transition-colors hover:text-rose-300 disabled:opacity-50"
                  >
                    清除選取交易的專案標籤
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
