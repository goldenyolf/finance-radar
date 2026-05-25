"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Loader2Icon, Pencil, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteTransaction,
  updateTransaction,
} from "@/lib/actions/transactions";

interface Props {
  transactionId: string;
  title: string;
  amount: number;
}

export function TransactionRowActions({
  transactionId,
  title,
  amount,
}: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const [savePending, startSaveTransition] = useTransition();

  const [draftTitle, setDraftTitle] = useState(title);
  const [draftAmount, setDraftAmount] = useState(String(amount));

  const titleId = useId();
  const amountId = useId();

  function handleDelete() {
    if (deletePending) return;
    if (!window.confirm(`確定要刪除「${title}」這筆帳目嗎？`)) return;
    startDeleteTransition(async () => {
      const result = await deleteTransaction(transactionId);
      if (!result.ok) {
        toast.error("刪除失敗", { description: result.error });
        return;
      }
      toast.success("已刪除帳目", { description: title });
      router.refresh();
    });
  }

  function openEdit(next: boolean) {
    if (savePending) return;
    setEditOpen(next);
    if (next) {
      setDraftTitle(title);
      setDraftAmount(String(amount));
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number.parseFloat(draftAmount);
    startSaveTransition(async () => {
      const result = await updateTransaction({
        id: transactionId,
        description: draftTitle,
        amount: parsed,
      });
      if (!result.ok) {
        toast.error("更新失敗", { description: result.error });
        return;
      }
      toast.success("已更新帳目", {
        description: `${draftTitle.trim()}・NT$ ${parsed.toLocaleString("zh-TW")}`,
      });
      setEditOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          aria-label={`編輯 ${title}`}
          onClick={() => openEdit(true)}
          disabled={savePending}
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
          aria-label={`刪除 ${title}`}
          onClick={handleDelete}
          disabled={deletePending}
        >
          {deletePending ? <Loader2Icon className="animate-spin" /> : <Trash2 />}
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={openEdit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>編輯帳目</DialogTitle>
            <DialogDescription>
              修正項目名稱與金額後即時同步至上方卡片與進度條。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={titleId}>項目名稱</Label>
              <Input
                id={titleId}
                required
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={amountId}>金額（TWD）</Label>
              <Input
                id={amountId}
                required
                inputMode="decimal"
                type="number"
                min="0"
                step="1"
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
                className="tabular-nums"
              />
            </div>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => openEdit(false)}
                disabled={savePending}
              >
                取消
              </Button>
              <Button type="submit" disabled={savePending}>
                {savePending ? (
                  <>
                    <Loader2Icon className="size-3.5 animate-spin" />
                    儲存中
                  </>
                ) : (
                  "儲存"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
