"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Loader2Icon, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  createRecurring,
  type CreateRecurringInput,
  type RecurringFrequency,
  type RecurringType,
} from "@/lib/actions/recurring";
import { FREQUENCY_LABEL } from "@/lib/dashboard";
import { getAccountLabel } from "@/lib/account-display";

interface RecurringAccount {
  id: string;
  name: string;
}

interface Props {
  userId: string | null;
  accounts: RecurringAccount[];
}

function todayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

export function AddRecurringDialog({ userId, accounts }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [type, setType] = useState<RecurringType>("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [accountId, setAccountId] = useState<string>(NO_ACCOUNT);
  const [nextDueDate, setNextDueDate] = useState(todayIsoDate);

  const titleId = useId();
  const amountId = useId();
  const freqId = useId();
  const accId = useId();
  const dateId = useId();

  function resetForm() {
    setType("expense");
    setTitle("");
    setAmount("");
    setFrequency("monthly");
    setAccountId(NO_ACCOUNT);
    setNextDueDate(todayIsoDate());
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) resetForm();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) {
      toast.error("找不到使用者，無法新增週期");
      return;
    }
    const parsedAmount = Number.parseFloat(amount);
    const payload: CreateRecurringInput = {
      userId,
      accountId: accountId === NO_ACCOUNT ? null : accountId,
      title,
      amount: parsedAmount,
      type,
      frequency,
      nextDueDate,
    };

    startTransition(async () => {
      const result = await createRecurring(payload);
      if (!result.ok) {
        toast.error("新增失敗", { description: result.error });
        return;
      }
      toast.success("已新增週期性項目", {
        description: `${type === "income" ? "收入" : "支出"} ${title.trim()} ・ ${FREQUENCY_LABEL[frequency]} NT$ ${parsedAmount.toLocaleString("zh-TW")}`,
      });
      setOpen(false);
      resetForm();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            size="lg"
            className="gap-1.5 rounded-full bg-foreground px-4 text-background shadow-sm shadow-foreground/10 hover:bg-foreground/90"
            disabled={!userId}
          />
        }
      >
        <Plus className="size-4" />
        新增週期
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新增週期性收支</DialogTitle>
          <DialogDescription>
            設定後系統會自動將其納入風險燈號與現金流預測。
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
              placeholder={
                type === "income" ? "例：每月薪資" : "例：房貸、Netflix"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoComplete="off"
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
                placeholder="0"
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
                  <SelectValue>
                    {(v) =>
                      typeof v === "string" && v in FREQUENCY_LABEL
                        ? FREQUENCY_LABEL[v as RecurringFrequency]
                        : (typeof v === "string" ? v : "")
                    }
                  </SelectValue>
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
                  <SelectValue placeholder="（可選）">
                    {(v) => {
                      const id = typeof v === "string" ? v : "";
                      if (!id) return "（可選）";
                      if (id === NO_ACCOUNT) return getAccountLabel(NO_ACCOUNT);
                      return getAccountLabel(
                        id,
                        accounts.find((a) => a.id === id)?.name
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACCOUNT}>
                    {getAccountLabel(NO_ACCOUNT)}
                  </SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {getAccountLabel(a.id, a.name)}
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
            <Button type="submit" disabled={pending || !userId}>
              {pending ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  儲存中
                </>
              ) : (
                "新增週期"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
