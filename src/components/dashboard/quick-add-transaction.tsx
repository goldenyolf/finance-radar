"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  ArrowRight,
  Loader2Icon,
  Plus,
  Repeat,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createTransaction,
  createTransfer,
  type CreateTransactionInput,
  type CreateTransferInput,
  type TransactionPriority,
  type TransactionStatus,
  type TransactionType,
} from "@/lib/actions/transactions";
import { getAccountLabel } from "@/lib/account-display";

export interface QuickAddAccount {
  id: string;
  name: string;
}

interface Props {
  userId: string | null;
  accounts: QuickAddAccount[];
}

function todayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const INITIAL_TYPE: TransactionType = "expense";
const INITIAL_PRIORITY: TransactionPriority = "essential";
const INITIAL_STATUS: TransactionStatus = "completed";

export function QuickAddTransaction({ userId, accounts }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [type, setType] = useState<TransactionType>(INITIAL_TYPE);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [priority, setPriority] = useState<TransactionPriority>(INITIAL_PRIORITY);
  const [status, setStatus] = useState<TransactionStatus>(INITIAL_STATUS);
  const [date, setDate] = useState(todayIsoDate);
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [fromAccountId, setFromAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState<string>(accounts[1]?.id ?? "");

  const descId = useId();
  const amountId = useId();
  const dateId = useId();
  const accountFieldId = useId();
  const fromFieldId = useId();
  const toFieldId = useId();
  const priorityGroupId = useId();
  const statusGroupId = useId();

  const isTransfer = type === "transfer";
  const needsTwoAccounts = isTransfer;
  const disabled =
    !userId ||
    accounts.length === 0 ||
    (needsTwoAccounts && accounts.length < 2);

  function resetForm() {
    setType(INITIAL_TYPE);
    setDescription("");
    setAmount("");
    setPriority(INITIAL_PRIORITY);
    setStatus(INITIAL_STATUS);
    setDate(todayIsoDate());
    setAccountId(accounts[0]?.id ?? "");
    setFromAccountId(accounts[0]?.id ?? "");
    setToAccountId(accounts[1]?.id ?? "");
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) resetForm();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) {
      toast.error("找不到使用者，無法新增交易");
      return;
    }
    const parsedAmount = Number.parseFloat(amount);

    if (isTransfer) {
      if (fromAccountId === toAccountId) {
        toast.error("轉出與轉入帳戶不能相同");
        return;
      }
      const payload: CreateTransferInput = {
        userId,
        fromAccountId,
        toAccountId,
        description,
        amount: parsedAmount,
        status,
        date,
      };
      startTransition(async () => {
        const result = await createTransfer(payload);
        if (!result.ok) {
          toast.error("新增失敗", { description: result.error });
          return;
        }
        const fromName = getAccountLabel(
          fromAccountId,
          accounts.find((a) => a.id === fromAccountId)?.name
        );
        const toName = getAccountLabel(
          toAccountId,
          accounts.find((a) => a.id === toAccountId)?.name
        );
        toast.success("已建立轉帳", {
          description: `${fromName} → ${toName}・NT$ ${parsedAmount.toLocaleString("zh-TW")}`,
        });
        setOpen(false);
        resetForm();
        router.refresh();
      });
      return;
    }

    const payload: CreateTransactionInput = {
      userId,
      accountId,
      description,
      amount: parsedAmount,
      type,
      priority,
      status,
      date,
    };

    startTransition(async () => {
      const result = await createTransaction(payload);
      if (!result.ok) {
        toast.error("新增失敗", { description: result.error });
        return;
      }
      toast.success("已新增交易", {
        description: `${type === "income" ? "收入" : "支出"} ${description.trim()} ・ NT$ ${parsedAmount.toLocaleString("zh-TW")}`,
      });
      setOpen(false);
      resetForm();
      router.refresh();
    });
  }

  const triggerDisabled = !userId || accounts.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Desktop：頁首 pill 按鈕（md+ 顯示） */}
      <DialogTrigger
        render={
          <Button
            size="lg"
            className="hidden gap-1.5 rounded-full bg-foreground px-4 text-background shadow-sm shadow-foreground/10 hover:bg-foreground/90 md:inline-flex"
            disabled={triggerDisabled}
          />
        }
      >
        <Plus className="size-4" />
        快速記帳
      </DialogTrigger>

      {/* Mobile：右下角 Extended FAB（md 以下顯示）
          z-50 / bottom-20 是為了浮在底部 tab bar（h-16, z-30）之上。
          calc 加 env(safe-area-inset-bottom) 處理瀏海手機的圓角安全區。 */}
      <DialogTrigger
        render={
          <Button
            aria-label="快速記帳"
            className="fixed right-5 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 h-14 gap-2 rounded-full bg-foreground pr-6 pl-5 text-base font-semibold text-background shadow-lg shadow-foreground/25 ring-1 ring-foreground/10 hover:bg-foreground/90 md:hidden [&_svg:not([class*='size-'])]:size-5"
            disabled={triggerDisabled}
          />
        }
      >
        <Plus strokeWidth={2.5} />
        記帳
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>快速記帳</DialogTitle>
          <DialogDescription>
            一筆收入、支出或內部轉帳，即時更新你的財務戰情室。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Tabs
            value={type}
            onValueChange={(v) => setType(v as TransactionType)}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="expense" className="gap-1.5">
                <TrendingDown className="size-3.5" /> 支出
              </TabsTrigger>
              <TabsTrigger value="income" className="gap-1.5">
                <TrendingUp className="size-3.5" /> 收入
              </TabsTrigger>
              <TabsTrigger value="transfer" className="gap-1.5">
                <Repeat className="size-3.5" /> 轉帳
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-1.5">
            <Label htmlFor={descId}>項目名稱</Label>
            <Input
              id={descId}
              required
              placeholder={
                isTransfer
                  ? "例：薪水帳戶 → 投資帳戶"
                  : type === "income"
                    ? "例：每月薪資"
                    : "例：六月房租、麥當勞"
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              <Label htmlFor={dateId}>交易日期</Label>
              <Input
                id={dateId}
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="tabular-nums"
              />
            </div>
          </div>

          {!isTransfer && (
            <div className="grid gap-1.5">
              <Label id={priorityGroupId}>支出屬性</Label>
              <RadioGroup
                value={priority}
                onValueChange={(v) => setPriority(v as TransactionPriority)}
                aria-labelledby={priorityGroupId}
                className="grid grid-cols-2 gap-2"
              >
                <ChoiceCard
                  value="essential"
                  label="必要"
                  hint="必須支出"
                  current={priority}
                  onSelect={setPriority}
                />
                <ChoiceCard
                  value="non_essential"
                  label="非必要"
                  hint="可調整或省略"
                  current={priority}
                  onSelect={setPriority}
                />
              </RadioGroup>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label id={statusGroupId}>交易狀態</Label>
            <RadioGroup
              value={status}
              onValueChange={(v) => setStatus(v as TransactionStatus)}
              aria-labelledby={statusGroupId}
              className="grid grid-cols-2 gap-2"
            >
              <ChoiceCard
                value="completed"
                label="已完成"
                hint="實際發生"
                current={status}
                onSelect={setStatus}
              />
              <ChoiceCard
                value="upcoming"
                label="未來預計"
                hint="未來帳單"
                current={status}
                onSelect={setStatus}
              />
            </RadioGroup>
          </div>

          {isTransfer ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={fromFieldId}>轉出帳戶</Label>
                <Select
                  value={fromAccountId}
                  onValueChange={(v) => setFromAccountId(v as string)}
                >
                  <SelectTrigger id={fromFieldId} className="w-full">
                    <SelectValue placeholder="選擇轉出帳戶">
                      {(v) => {
                        const id = typeof v === "string" ? v : "";
                        if (!id) return "選擇轉出帳戶";
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
              </div>
              <div className="flex items-center justify-center text-muted-foreground">
                <ArrowRight className="size-4" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={toFieldId}>轉入帳戶</Label>
                <Select
                  value={toAccountId}
                  onValueChange={(v) => setToAccountId(v as string)}
                >
                  <SelectTrigger id={toFieldId} className="w-full">
                    <SelectValue placeholder="選擇轉入帳戶">
                      {(v) => {
                        const id = typeof v === "string" ? v : "";
                        if (!id) return "選擇轉入帳戶";
                        return getAccountLabel(
                          id,
                          accounts.find((a) => a.id === id)?.name
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem
                        key={acc.id}
                        value={acc.id}
                        disabled={acc.id === fromAccountId}
                      >
                        {getAccountLabel(acc.id, acc.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {accounts.length < 2 && (
                <p className="rounded-lg border border-dashed border-input px-3 py-2 text-xs text-muted-foreground">
                  至少需要兩個帳戶才能建立內部轉帳。
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor={accountFieldId}>
                {type === "income" ? "入帳" : "扣款"}帳戶
              </Label>
              {accounts.length > 0 ? (
                <Select
                  value={accountId}
                  onValueChange={(v) => setAccountId(v as string)}
                >
                  <SelectTrigger id={accountFieldId} className="w-full">
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
                  目前尚未建立任何帳戶，請先到 Supabase 新增 accounts。
                </p>
              )}
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending || disabled}>
              {pending ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  儲存中
                </>
              ) : isTransfer ? (
                "建立轉帳"
              ) : (
                "新增交易"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ChoiceProps<T extends string> {
  value: T;
  label: string;
  hint: string;
  current: T;
  onSelect: (v: T) => void;
}

function ChoiceCard<T extends string>({
  value,
  label,
  hint,
  current,
  onSelect,
}: ChoiceProps<T>) {
  const active = current === value;
  return (
    <label
      data-state={active ? "active" : "inactive"}
      className="group flex cursor-pointer items-start gap-2.5 rounded-lg border border-input bg-background p-3 transition-colors hover:border-foreground/30 data-[state=active]:border-foreground data-[state=active]:bg-foreground/[0.03]"
    >
      <RadioGroupItem
        value={value}
        className="mt-0.5"
        onClick={() => onSelect(value)}
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium leading-none">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
    </label>
  );
}
