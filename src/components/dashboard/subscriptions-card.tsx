"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  Loader2Icon,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createSubscription,
  deleteSubscription,
  updateSubscription,
  type CreateSubscriptionInput,
} from "@/lib/actions/subscriptions";
import { getAccountLabel } from "@/lib/account-display";
import { formatCurrency, type AccountRow } from "@/lib/dashboard";
import {
  daysUntilBilling,
  type BillingCycle,
  type SubscriptionRow,
} from "@/lib/subscriptions";

interface Props {
  subscriptions: SubscriptionRow[];
  accounts: AccountRow[];
}

interface DraftState {
  id?: string;
  name: string;
  amount: string;
  billingCycle: BillingCycle;
  nextBillingDate: string;
  accountId: string;
  category: string;
}

const BLANK_DRAFT: DraftState = {
  name: "",
  amount: "",
  billingCycle: "monthly",
  nextBillingDate: "",
  accountId: "",
  category: "固定支出",
};

function todayIso(): string {
  const d = new Date();
  const tw = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return tw.format(d);
}

export function SubscriptionsCard({ subscriptions, accounts }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(BLANK_DRAFT);
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openCreate() {
    setDraft({
      ...BLANK_DRAFT,
      nextBillingDate: todayIso(),
      accountId: accounts[0]?.id ?? "",
    });
    setOpen(true);
  }

  function openEdit(row: SubscriptionRow) {
    setDraft({
      id: row.id,
      name: row.name,
      amount: String(row.amount),
      billingCycle: row.billing_cycle,
      nextBillingDate: row.next_billing_date,
      accountId: row.account_id,
      category: row.category,
    });
    setOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: CreateSubscriptionInput = {
      name: draft.name,
      amount: Number.parseFloat(draft.amount),
      billingCycle: draft.billingCycle,
      nextBillingDate: draft.nextBillingDate,
      accountId: draft.accountId,
      category: draft.category,
    };

    startTransition(async () => {
      const result = draft.id
        ? await updateSubscription({ ...payload, id: draft.id })
        : await createSubscription(payload);
      if (!result.ok) {
        toast.error(draft.id ? "更新失敗" : "新增失敗", {
          description: result.error,
        });
        return;
      }
      toast.success(draft.id ? "訂閱已更新" : "已新增訂閱", {
        description: draft.name,
      });
      setOpen(false);
      router.refresh();
    });
  }

  function handleDelete(row: SubscriptionRow) {
    if (deletingId) return;
    if (!window.confirm(`確定要刪除「${row.name}」這筆訂閱嗎？`)) return;
    setDeletingId(row.id);
    startTransition(async () => {
      const result = await deleteSubscription(row.id);
      setDeletingId(null);
      if (!result.ok) {
        toast.error("刪除失敗", { description: result.error });
        return;
      }
      toast.success("已刪除訂閱", { description: row.name });
      router.refresh();
    });
  }

  const sorted = [...subscriptions].sort(
    (a, b) => a.next_billing_date.localeCompare(b.next_billing_date)
  );

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">
                🛡️ 訂閱制固定扣款雷達
              </CardTitle>
            </div>
            <CardDescription className="mt-1">
              盯著你已訂閱的服務（Netflix、ChatGPT Plus...），
              扣款前 3 天 LINE 主動推警報，防範「忘了取消」漏洞。
            </CardDescription>
          </div>
          <Button
            type="button"
            size="lg"
            className="gap-1.5 rounded-full"
            onClick={openCreate}
          >
            <Plus className="size-4" />
            新增訂閱
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {sorted.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
            還沒登記任何訂閱項目。點右上「新增訂閱」開始建立漏洞清單。
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {sorted.map((row) => (
              <SubscriptionRowItem
                key={row.id}
                row={row}
                accounts={accounts}
                onEdit={() => openEdit(row)}
                onDelete={() => handleDelete(row)}
                deleting={deletingId === row.id}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <SubscriptionDialog
        open={open}
        onOpenChange={(v) => !pending && setOpen(v)}
        draft={draft}
        setDraft={setDraft}
        accounts={accounts}
        pending={pending}
        onSubmit={handleSubmit}
        isEdit={!!draft.id}
      />
    </Card>
  );
}

/* ─────────────────────────── Row ─────────────────────────── */

interface RowItemProps {
  row: SubscriptionRow;
  accounts: AccountRow[];
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function SubscriptionRowItem({
  row,
  accounts,
  onEdit,
  onDelete,
  deleting,
}: RowItemProps) {
  const days = daysUntilBilling(row.next_billing_date);
  const accName = getAccountLabel(
    row.account_id,
    accounts.find((a) => a.id === row.account_id)?.name
  );

  // 倒數天色階：≤3 天紅、≤7 天橘、其餘灰
  const tone =
    days <= 3
      ? "text-rose-600 dark:text-rose-400"
      : days <= 7
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  const daysLabel =
    Number.isNaN(days)
      ? "日期錯誤"
      : days < 0
        ? `已過期 ${-days} 天`
        : days === 0
          ? "今日扣款"
          : `${days} 天後扣款`;

  return (
    <li className="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/40">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{row.name}</span>
          <span className="text-xs text-muted-foreground">
            · {row.billing_cycle === "monthly" ? "每月" : "每年"}
          </span>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{accName}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className={tone}>{daysLabel}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="tabular-nums">{row.next_billing_date}</span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatCurrency(Number(row.amount))}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`編輯 ${row.name}`}
            onClick={onEdit}
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`刪除 ${row.name}`}
            onClick={onDelete}
            disabled={deleting}
            className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
          >
            {deleting ? <Loader2Icon className="animate-spin" /> : <Trash2 />}
          </Button>
        </div>
      </div>
    </li>
  );
}

/* ─────────────────────────── Dialog ─────────────────────────── */

interface DialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: DraftState;
  setDraft: (next: DraftState) => void;
  accounts: AccountRow[];
  pending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isEdit: boolean;
}

function SubscriptionDialog({
  open,
  onOpenChange,
  draft,
  setDraft,
  accounts,
  pending,
  onSubmit,
  isEdit,
}: DialogProps) {
  const nameId = useId();
  const amountId = useId();
  const dateId = useId();
  const cycleId = useId();
  const accId = useId();
  const catId = useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "編輯訂閱" : "新增訂閱"}</DialogTitle>
          <DialogDescription>
            扣款前 3 天會自動 LINE 推播提醒。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={nameId}>訂閱名稱</Label>
            <Input
              id={nameId}
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例：Netflix、ChatGPT Plus"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={amountId}>金額 (TWD)</Label>
              <Input
                id={amountId}
                required
                type="number"
                inputMode="numeric"
                min="0"
                step="10"
                value={draft.amount}
                onChange={(e) =>
                  setDraft({ ...draft, amount: e.target.value })
                }
                className="tabular-nums"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={dateId}>下次扣款日</Label>
              <Input
                id={dateId}
                required
                type="date"
                value={draft.nextBillingDate}
                onChange={(e) =>
                  setDraft({ ...draft, nextBillingDate: e.target.value })
                }
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={cycleId}>扣款週期</Label>
              <Select
                value={draft.billingCycle}
                onValueChange={(v) =>
                  setDraft({ ...draft, billingCycle: v as BillingCycle })
                }
              >
                <SelectTrigger id={cycleId} className="w-full">
                  <SelectValue>
                    {(v) =>
                      v === "yearly"
                        ? "每年"
                        : v === "monthly"
                          ? "每月"
                          : "選擇週期"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">每月</SelectItem>
                  <SelectItem value="yearly">每年</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={catId}>分類標籤</Label>
              <Input
                id={catId}
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
                placeholder="固定支出"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={accId}>扣款帳戶</Label>
            {accounts.length > 0 ? (
              <Select
                value={draft.accountId}
                onValueChange={(v) =>
                  setDraft({ ...draft, accountId: v as string })
                }
              >
                <SelectTrigger id={accId} className="w-full">
                  <SelectValue placeholder="選擇帳戶">
                    {(v) => {
                      const id = typeof v === "string" ? v : "";
                      if (!id) return "選擇帳戶";
                      return getAccountLabel(
                        id,
                        accounts.find((a) => a.id === id)?.name
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {getAccountLabel(acc.id, acc.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-lg border border-dashed border-input px-3 py-2 text-xs text-muted-foreground">
                尚未建立任何帳戶
              </p>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  儲存中
                </>
              ) : isEdit ? (
                "儲存變更"
              ) : (
                "新增訂閱"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
