"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, Reorder, useDragControls } from "framer-motion";
import { Check, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { BoardCard } from "@/components/dashboard/board-card";
import { Button } from "@/components/ui/button";
import type { CategoryRow } from "@/lib/categories";
import {
  reorderDashboardPlates,
  updateDashboardPlateEmoji,
} from "@/lib/actions/dashboard-plates";
import type { AccountRow, BoardData } from "@/lib/dashboard";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * 編輯模式 / 拖拉排序 / Emoji 自訂三合一 wrapper。
 *
 * 互動規則：
 *   - 長按任一張卡片 0.5 秒 → 進入編輯模式（haptic 'success' 20ms）
 *   - 點右上「⚙️ 編輯排版」按鈕也行
 *   - 編輯模式下：3 張卡發抖（±0.5deg 1.2s 循環）、emoji 旁出現編輯筆刷、
 *     drag handle 啟用
 *   - 拖完放開 → onReorder 觸發、把新順序持久化到 server
 *   - 點 emoji 旁筆刷 → BoardCard 內部 Popover 自處理
 *   - 點右上「✓ 完成」→ 退出編輯模式
 *
 * 為什麼 desktop-only：mobile 用 Tabs 切換板塊（每次只看 1 張），drag UX
 * 不適合 tab UI。Mobile 編輯體驗 v2 再做。
 */

interface Props {
  data: BoardData[];
  allAccounts: AccountRow[];
  categories: CategoryRow[];
}

export function PlateEditableGrid({ data, allAccounts, categories }: Props) {
  const router = useRouter();
  const [isEditMode, setIsEditMode] = useState(false);
  // 樂觀本地順序 — 拖拉時即時更新，server 失敗才 router.refresh() 回滾
  const [order, setOrder] = useState<BoardData[]>(data);

  // server 傳新 data 時 sync 本地（reorder 後 router.refresh + 別人改了 DB）
  useEffect(() => {
    setOrder(data);
  }, [data]);

  const exitEditMode = () => setIsEditMode(false);

  const enterEditMode = () => {
    setIsEditMode(true);
    triggerHaptic("success");
  };

  function handleReorderEnd() {
    // Reorder 過程中 setOrder 已即時更新；放開手後把最終順序送 server
    const orderedIds = order.map((b) => b.meta.plateId);
    (async () => {
      const result = await reorderDashboardPlates(orderedIds);
      if (!result.ok) {
        toast.error("排序儲存失敗", { description: result.error });
        router.refresh(); // 回滾本地順序到真實 DB 狀態
      }
    })();
  }

  function handleEmojiChange(plateId: string, emoji: string) {
    // 樂觀更新本地 + 持久化
    setOrder((prev) =>
      prev.map((b) =>
        b.meta.plateId === plateId
          ? { ...b, meta: { ...b.meta, emoji } }
          : b
      )
    );
    triggerHaptic("select");
    (async () => {
      const result = await updateDashboardPlateEmoji(plateId, emoji);
      if (!result.ok) {
        toast.error("Emoji 更新失敗", { description: result.error });
        router.refresh();
      }
    })();
  }

  const gridColsClass =
    order.length === 1
      ? "grid-cols-1"
      : order.length === 2
        ? "grid-cols-2"
        : "grid-cols-1 lg:grid-cols-3";

  return (
    <div className="hidden md:block">
      {/* 編輯模式切換鈕 — 右上角 */}
      <div className="mb-4 flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={isEditMode ? exitEditMode : enterEditMode}
          className={cn(
            "gap-1.5 rounded-full transition-colors",
            isEditMode
              ? "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-500/90 hover:text-white"
              : "text-muted-foreground"
          )}
        >
          {isEditMode ? (
            <>
              <Check className="size-3.5" />
              完成編輯
            </>
          ) : (
            <>
              <Settings2 className="size-3.5" />
              編輯排版
            </>
          )}
        </Button>
      </div>

      {/*
        Reorder.Group axis="x"：水平拖拉。layout 用 grid，axis 決定拖拉方向。
        dragListener 控制是否啟用 drag — 非編輯模式 false = 卡片不可拖只可點。
      */}
      <Reorder.Group
        as="section"
        aria-label="財務板塊"
        axis="x"
        values={order}
        onReorder={setOrder}
        className={cn("grid gap-4", gridColsClass)}
      >
        {order.map((b) => (
          <PlateItem
            key={b.meta.plateId}
            board={b}
            isEditMode={isEditMode}
            onReorderEnd={handleReorderEnd}
            onEmojiChange={handleEmojiChange}
            allAccounts={allAccounts}
            categories={categories}
            onLongPress={enterEditMode}
          />
        ))}
      </Reorder.Group>
    </div>
  );
}

/* ─────────────────── 單張可拖拉 + 發抖的 Reorder.Item ─────────────────── */

interface ItemProps {
  board: BoardData;
  isEditMode: boolean;
  allAccounts: AccountRow[];
  categories: CategoryRow[];
  onReorderEnd: () => void;
  onEmojiChange: (plateId: string, emoji: string) => void;
  onLongPress: () => void;
}

function PlateItem({
  board,
  isEditMode,
  allAccounts,
  categories,
  onReorderEnd,
  onEmojiChange,
  onLongPress,
}: ItemProps) {
  const dragControls = useDragControls();

  // 長按 500ms 偵測 — 非編輯模式才聽，已在編輯模式就不必再觸發
  // Reorder.Item 預設 render <li>，pointer event 走 HTMLLIElement
  const longPressTimer = useRef<number | null>(null);
  const handlePointerDown = (e: React.PointerEvent<HTMLLIElement>) => {
    if (isEditMode) {
      // 編輯模式下委派 drag 啟動 — 透過 useDragControls 手動觸發
      dragControls.start(e);
      return;
    }
    longPressTimer.current = window.setTimeout(() => {
      onLongPress();
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <Reorder.Item
      value={board}
      dragListener={isEditMode}
      dragControls={dragControls}
      onDragEnd={onReorderEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      // jiggle 動畫 — 編輯模式才跑、隨機 phase 避免 3 張卡同步看起來像機器人
      animate={
        isEditMode
          ? {
              rotate: [
                -0.5 + Math.random() * 0.2,
                0.5 - Math.random() * 0.2,
                -0.5 + Math.random() * 0.2,
              ],
            }
          : { rotate: 0 }
      }
      transition={{
        rotate: isEditMode
          ? {
              duration: 0.18,
              repeat: Infinity,
              repeatType: "reverse",
              ease: "easeInOut",
            }
          : { duration: 0.2 },
      }}
      style={{
        cursor: isEditMode ? "grab" : "auto",
      }}
      whileDrag={{
        scale: 1.03,
        zIndex: 50,
        boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.45)",
        cursor: "grabbing",
      }}
      className="touch-none"
    >
      <motion.div layout>
        <BoardCard
          data={board}
          allAccounts={allAccounts}
          categories={categories}
          isEditMode={isEditMode}
          onEmojiChange={(emoji) =>
            onEmojiChange(board.meta.plateId, emoji)
          }
        />
      </motion.div>
    </Reorder.Item>
  );
}
