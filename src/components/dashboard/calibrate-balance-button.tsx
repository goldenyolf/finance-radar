"use client";

/**
 * 資產校正儀 — pencil 按鈕 + Dialog 表單組合。
 *
 * 設計重點:
 *   1) Controlled open (per memory: base-ui DialogTrigger + Button silent 失效) —
 *      用純 <Button onClick={() => setOpen(true)}> + <Dialog open={open}>
 *   2) 不污染圖表 — 純 UPDATE balance；user-facing 文案明確告知
 *   3) 信用卡可負值 — input 不擋負號；server action 也允許
 *   4) Optimistic refresh 用 router.refresh() — Server Action 已 revalidatePath，
 *      router.refresh() 觸發 RSC 重抓，AnimatedNumber 接到新值會「唰」動
 *   5) Apple 暗黑工業風 — pencil 按鈕 hover 才浮出，桌面 group-hover、行動端
 *      永遠顯示（透過 opacity sm: 切換維持可觸性）
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { calibrateAccountBalance } from "@/lib/actions/accounts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, num } from "@/lib/dashboard";

interface Props {
  accountId: string;
  accountName: string;
  currentBalance: number | string;
  /**
   * 視覺呈現 — 預設小 pencil hover-revealed；給 'always' 就永遠顯示
   * （settings 列表那種「我就是要編輯」的場景用得到）。
   */
  variant?: "subtle" | "always";
}

export function CalibrateBalanceButton({
  accountId,
  accountName,
  currentBalance,
  variant = "subtle",
}: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const currentNum = num(currentBalance);

  // Dialog 開啟時把當前餘額灌進 input — user 通常做小修而非從零打
  function handleOpenChange(next: boolean) {
    if (next) {
      // 不顯示 "0"，留空白給 user 重打較乾淨
      setValue(currentNum === 0 ? "" : String(currentNum));
    }
    setOpen(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      toast.error("請輸入有效金額");
      return;
    }

    startTransition(async () => {
      const result = await calibrateAccountBalance(accountId, parsed);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`已校正【${accountName}】餘額為 ${formatCurrency(parsed)}`);
      setOpen(false);
      // 即使 server action 已 revalidatePath，router.refresh() 強制 client
      // tree 重新 reconcile，AnimatedNumber 立刻拿到新值跑動畫
      router.refresh();
    });
  }

  const triggerClassName =
    variant === "always"
      ? "shrink-0 text-muted-foreground hover:text-foreground"
      : "shrink-0 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 max-sm:opacity-100";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`校正 ${accountName} 餘額`}
        onClick={() => handleOpenChange(true)}
        className={triggerClassName}
      >
        <Pencil className="size-3" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>校正餘額 — {accountName}</DialogTitle>
            <DialogDescription>
              輸入此帳戶當前的實際銀行餘額。本操作為純粹的數字校正，
              <span className="font-medium text-foreground">
                不會新增任何交易明細
              </span>
              ，不影響你的月度收支與儲蓄率圖表。
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 pt-1"
            id="calibrate-balance-form"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="balance-input" className="text-xs uppercase tracking-wider text-muted-foreground">
                新餘額
              </Label>
              <div className="relative">
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-muted-foreground"
                >
                  $
                </span>
                <Input
                  id="balance-input"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={String(currentNum)}
                  autoFocus
                  className="pl-7 text-base font-medium tabular-nums tracking-tight"
                />
              </div>
              <p className="flex items-baseline justify-between text-[11px] text-muted-foreground/70">
                <span>當前餘額</span>
                <span className="tabular-nums text-foreground/80">
                  {formatCurrency(currentNum)}
                </span>
              </p>
            </div>
          </form>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              type="submit"
              form="calibrate-balance-form"
              disabled={pending || value.trim() === ""}
            >
              {pending ? "校正中..." : "儲存校正"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
