"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ChevronDown,
  FolderTree,
  Loader2Icon,
  Tag,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  bulkUpdateTransactionCategory,
  bulkUpdateTransactionProject,
} from "@/lib/actions/transactions";
import {
  buildCategoryOptions,
  type CategoryOption,
  type CategoryRow,
} from "@/lib/categories";
import {
  EXPENSE_CATEGORY_COLOR,
  EXPENSE_CATEGORY_LABEL,
} from "@/lib/expense-categories";

interface Props {
  /** 當前已選 transaction id 集合（已過濾為「真的存在於畫面」的 id） */
  selectedIds: string[];
  /** 既有 tag 清單（已去重去空白）— 專案 tab chip 用 */
  availableTags: string[];
  /** 使用者動態分類（含自訂）— 分類 tab chip list 來源；未傳退到 built-in 7 大類。 */
  categories?: CategoryRow[];
  /** 全清空選擇 — 取消鍵 / 成功後呼叫 */
  onClearSelection: () => void;
  /** action 成功 → 父層 router.refresh() */
  onSuccess: () => void;
}


/**
 * 懸浮批次工具列 — 多選 ≥ 1 筆時從底部 spring 滑入。
 *
 * 設計:
 *   - createPortal 跳到 document.body，避開父層 PageTransition / motion.div 的
 *     stacking context 困住（同 QuickAdd FAB 的處理）。
 *   - 玻璃 bar 走 zinc-950/90 + backdrop-blur-xl，跟 Popover / Tooltip 同款。
 *   - 右側「批次操作 ▾」單顆 trigger 開一個 Popover，內用 Tabs 切「歸納專案」
 *     跟「更改分類」兩入口，不再兩個 chip 分開排。
 *   - 上限攔在 server 端（500 筆），UI 只負責 happy path。
 */
export function BulkActionsBar({
  selectedIds,
  availableTags,
  categories,
  onClearSelection,
  onSuccess,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [pending, startTransition] = useTransition();

  const visible = selectedIds.length > 0;
  const categoryChips = buildCategoryOptions(
    categories,
    EXPENSE_CATEGORY_LABEL,
    EXPENSE_CATEGORY_COLOR
  );

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
      const skippedNote =
        result.skippedCount > 0 ? `（${result.skippedCount} 筆被略過）` : "";
      toast.success(
        tag
          ? `已批次歸納 ${result.updatedCount} 筆到「${tag}」${skippedNote}`
          : `已清除 ${result.updatedCount} 筆專案標籤${skippedNote}`,
        { icon: <CheckCircle2 className="size-4 text-emerald-500" /> }
      );
      setPickerOpen(false);
      setNewTag("");
      onClearSelection();
      onSuccess();
    });
  }

  function applyCategory(chip: CategoryOption) {
    if (pending) return;
    startTransition(async () => {
      const result = await bulkUpdateTransactionCategory({
        transactionIds: selectedIds,
        category: chip.value,
      });
      if (!result.ok) {
        toast.error("批次更新失敗", { description: result.error });
        return;
      }
      const skippedNote =
        result.skippedCount > 0
          ? `（${result.skippedCount} 筆非支出被略過）`
          : "";
      toast.success(
        `已把 ${result.updatedCount} 筆更改為【${chip.name}】${skippedNote}`,
        { icon: <CheckCircle2 className="size-4 text-emerald-500" /> }
      );
      setPickerOpen(false);
      onClearSelection();
      onSuccess();
    });
  }

  function handleApplyNewTag() {
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

            {/* 右側：單顆「批次操作 ▾」開 Popover，內用 Tabs 切 tag / category */}
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger
                type="button"
                disabled={pending}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background shadow-sm hover:bg-foreground/90 disabled:opacity-50 sm:text-sm"
                aria-label="批次操作選單"
              >
                {pending ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <FolderTree className="size-3.5" />
                )}
                <span>批次操作</span>
                <ChevronDown className="size-3.5 opacity-70" aria-hidden />
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                sideOffset={10}
                className="w-[min(22rem,calc(100vw-1.5rem))] p-3"
              >
                <Tabs defaultValue="tag" className="gap-2">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="tag" className="gap-1.5">
                      <Tag className="size-3.5" />
                      歸納專案
                    </TabsTrigger>
                    <TabsTrigger value="category" className="gap-1.5">
                      <FolderTree className="size-3.5" />
                      更改分類
                    </TabsTrigger>
                  </TabsList>

                  {/* ─── Tab 1: 歸納專案 ─── */}
                  <TabsContent value="tag">
                    <div className="flex flex-col gap-3">
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
                            onClick={handleApplyNewTag}
                            disabled={pending || !newTag.trim()}
                          >
                            套用
                          </Button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => applyTag(null)}
                        disabled={pending}
                        className="-mx-1 mt-1 inline-flex items-center justify-center gap-1.5 rounded-md border-t border-zinc-800 px-2 pt-3 text-xs text-zinc-400 transition-colors hover:text-rose-300 disabled:opacity-50"
                      >
                        清除選取交易的專案標籤
                      </button>
                    </div>
                  </TabsContent>

                  {/* ─── Tab 2: 更改分類 ─── */}
                  <TabsContent value="category">
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] font-medium tracking-wider text-zinc-400 uppercase">
                        選擇花費類型
                      </p>
                      <p className="text-[10px] leading-relaxed text-zinc-500">
                        僅套用到選取中的支出交易；轉帳 / 收入會被略過。
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {categoryChips.map((chip) => (
                          <button
                            key={chip.value}
                            type="button"
                            onClick={() => applyCategory(chip)}
                            disabled={pending}
                            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/50 px-2.5 py-1 text-xs text-zinc-100 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-100 disabled:opacity-50"
                          >
                            <span
                              aria-hidden
                              className="inline-block size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: chip.color }}
                            />
                            {chip.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </PopoverContent>
            </Popover>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
