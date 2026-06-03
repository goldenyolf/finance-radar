"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, Sparkles, Zap } from "lucide-react";
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
import { seedDemoData } from "@/lib/actions/seed-demo-data";

/**
 * 與 server action 同條件的 env gate — NEXT_PUBLIC_* 在 build-time inline
 * 到 client bundle，配上 dev 模式自動開啟，跟 seedDemoData() 內部判斷
 * 完全鏡像。Production fork 要展示就設 NEXT_PUBLIC_ENABLE_DEMO_SEED=true。
 */
const DEMO_SEED_ENABLED =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED === "true";

/**
 * ⚡ Demo 種子按鈕。
 *
 * 行為：env gate 不過直接 return null（按鈕完全消失），通過後渲染發光按鈕。
 * 點擊先彈警告 dialog 強制使用者讀完「會塞 36 筆 [DEMO] 標記資料、可在
 * /transactions 搜 [DEMO] 清理」三件事，按確認才實際觸發 seed action。
 */
export function SeedDemoButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!DEMO_SEED_ENABLED) return null;

  function handleConfirm() {
    startTransition(async () => {
      const result = await seedDemoData();
      if (!result.ok) {
        toast.error("Demo 種子注入失敗", { description: result.error });
        return;
      }
      toast.success("🎉 Demo 模式啟動成功！", {
        description: `已注入 ${result.inserted.transactions} 筆交易 + ${result.inserted.snapshots} 筆資產快照，重新整理就能看到漂亮的圖表！`,
      });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mt-12 flex flex-col items-center gap-3">
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={pending}
          className="group relative h-12 gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-7 text-base font-semibold text-white shadow-lg shadow-indigo-500/30 ring-1 ring-white/20 transition-all hover:shadow-xl hover:shadow-indigo-500/40 hover:brightness-110 disabled:opacity-50"
        >
          {/* 發光暈圈 — 持續低速 pulse */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-40 blur-md transition-opacity group-hover:opacity-60"
          />
          <span className="relative flex items-center gap-2">
            <Zap className="size-5" strokeWidth={2.5} />
            啟動展示模式 (Demo Mode)
            <Sparkles className="size-4 opacity-80" />
          </span>
        </Button>
        <p className="text-center text-[11px] text-muted-foreground/70">
          ⚠️ 此動作會為當前帳號注入模擬展示數據（[DEMO] 標記）
        </p>
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => !pending && setOpen(v)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="size-5 text-indigo-500" />
              啟動展示模式
            </DialogTitle>
            <DialogDescription>
              這個動作會為你目前登入的帳號塞入展示用模擬資料，方便剛 clone 專案的新使用者快速看到圖表長相。
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 rounded-lg bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground ring-1 ring-foreground/5">
            <li>
              • 將注入過去 <strong className="text-foreground">6 個月</strong>{" "}
              共 ~36 筆模擬交易（房貸 / 托育 / 餐飲 / 加油 / 保險…）
            </li>
            <li>
              • 將注入 <strong className="text-foreground">6 筆月底資產快照</strong>（100 萬 → 125 萬漸層）
            </li>
            <li>
              • 所有 demo 交易描述帶有{" "}
              <code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[10px] text-foreground">
                [DEMO]
              </code>{" "}
              前綴，到 /transactions 搜尋此字即可批次找到並刪除
            </li>
            <li>
              • 重複點此按鈕會疊加新一輪交易；資產快照則 upsert 不重複
            </li>
          </ul>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white hover:brightness-110"
            >
              {pending ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  正在注入...
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  確認注入 Demo 資料
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
