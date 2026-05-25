"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Loader2Icon, Pencil, TrendingDown, TrendingUp } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  updateRecurring,
  type RecurringFrequency,
  type RecurringType,
  type UpdateRecurringInput,
} from "@/lib/actions/recurring";
import { FREQUENCY_LABEL } from "@/lib/dashboard";

interface RecurringAccount {
  id: string;
  name: string;
}

interface Props {
  id: string;
  initial: {
    title: string;
    amount: number;
    type: RecurringType;
    frequency: RecurringFrequency;
    accountId: string | null;
    nextDueDate: string;
  };
  accounts: RecurringAccount[];
}

const NO_ACCOUNT = "__none__";
const FREQUENCY_OPTIONS: RecurringFrequency[] = [
  "monthly",
  "weekly",
  "biweekly",
  "quarterly",
  "semi_annually",
  "yearly",
  "daily",
];

function toIsoDateInput(value: string): string {
  if (!value) return "";
  // Supabase 回來的可能是 YYYY-MM-DD 或完整 ISO；<input type="date"> 只吃 YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function EditRecurringDialog({ id, initial, accounts }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [type, setType] = useState<RecurringType>(initial.type);
  const [title, setTitle] = useState(initial.title);
  const [amount, setAmount] = useState(String(initial.amount));
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    initial.frequency
  );
  const [accountId, setAccountId] = useState<string>(
    initial.accountId ?? NO_ACCOUNT
  );
  const [nextDueDate, setNextDueDate] = useState(
    toIsoDateInput(initial.nextDueDate)
  );

  const titleId = useId();
  const amountId = useId();
  const freqId = useId();
  const accId = useId();
  const dateId = useId();

  function resetFromInitial() {
    setType(initial.type);
    setTitle(initial.title);
    setAmount(String(initial.amount));
    setFrequency(initial.frequency);
    setAccountId(initial.accountId ?? NO_ACCOUNT);
    setNextDueDate(toIsoDateInput(initial.nextDueDate));
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) resetFromInitial();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number.parseFloat(amount);
    const payload: UpdateRecurringInput = {
      id,
      accountId: accountId === NO_ACCOUNT ? null : accountId,
      title,
      amount: parsedAmount,
      type,
      frequency,
      nextDueDate,
    };

    startTransition(async () => {
      const result = await updateRecurring(payload);
      if (!result.ok) {
        toast.error("更新失敗", { description: result.error });
        return;
      }
      toast.success("已更新週期", {
        description: `${type === "income" ? "收入" : "支出"} ${title.trim()} ・ ${FREQUENCY_LABEL[frequency]} NT$ ${parsedAmount.toLocaleString("zh-TW")}`,
      });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`編輯 ${initial.title}`}
        onClick={() => handleOpenChange(true)}
        disabled={pending}
      >
        <Pencil className="size-3.5 text-muted-foreground" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>編輯週期性收支</DialogTitle>
            <DialogDescription>
              修改後系統會立即更新風險燈號與現金流預測。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Tabs
              value={type}
              onValueChange={(v) => setType(v as RecurringType)}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="expense" className="gap-1.5">
                  <TrendingDown className="size-3.5" /> 固定支出
                </TabsTrigger>
                <TabsTrigger value="income" className="gap-1.5">
                  <TrendingUp className="size-3.5" /> 固定收入
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid gap-1.5">
              <Label htmlFor={titleId}>項目名稱</Label>
              <Input
                id={titleId}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={amountId}>金額（TWD）</Label>
                <Input
                  id={amountId}
                  required
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="tabular-nums"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={freqId}>頻率</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as RecurringFrequency)}
                >
                  <SelectTrigger id={freqId} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FREQUENCY_LABEL[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={dateId}>下次執行日期</Label>
                <Input
                  id={dateId}
                  required
                  type="date"
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                  className="tabular-nums"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={accId}>關聯帳戶</Label>
                <Select
                  value={accountId}
                  onValueChange={(v) => setAccountId(v as string)}
                >
                  <SelectTrigger id={accId} className="w-full">
                    <SelectValue placeholder="（可選）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ACCOUNT}>未指定帳戶</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
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
