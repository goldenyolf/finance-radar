"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Banknote,
  CreditCard,
  Landmark,
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
  type PaymentMethod,
  type TransactionPriority,
  type TransactionStatus,
  type TransactionType,
} from "@/lib/actions/transactions";
import { getAccountLabel } from "@/lib/account-display";
import type { AccountType } from "@/lib/dashboard";

export interface QuickAddAccount {
  id: string;
  name: string;
  type: AccountType;
}

interface Props {
  accounts: QuickAddAccount[];
  /**
   * 既有 project_tag 清單（去重）— 給 <datalist> 做即時自動完成。
   * caller 從 transactions 撈 distinct 後傳進來；undefined / [] 時退化成純
   * placeholder 提示，UI 不出 hint 列表。
   */
  projectTagSuggestions?: string[];
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

// 帳戶類型 <-> 付款方式：bank 帳戶現代消費場景就是「銀行轉帳/匯款」，
// cash/credit_card 帳戶則一一對應。雙向綁定的核心 mapping。
const ACCOUNT_TYPE_TO_PAYMENT: Record<AccountType, PaymentMethod> = {
  cash: "cash",
  credit_card: "credit_card",
  bank: "transfer",
};
const PAYMENT_TO_ACCOUNT_TYPE: Record<PaymentMethod, AccountType> = {
  cash: "cash",
  credit_card: "credit_card",
  transfer: "bank",
};

export function QuickAddTransaction({ accounts, projectTagSuggestions }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // 初始 paymentMethod 跟著第一個帳戶 type 走（最常見：cash → cash, bank → transfer）
  const initialPaymentMethod = (): PaymentMethod =>
    accounts[0] ? ACCOUNT_TYPE_TO_PAYMENT[accounts[0].type] : "cash";

  const [type, setType] = useState<TransactionType>(INITIAL_TYPE);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [priority, setPriority] = useState<TransactionPriority>(INITIAL_PRIORITY);
  const [status, setStatus] = useState<TransactionStatus>(INITIAL_STATUS);
  const [date, setDate] = useState(todayIsoDate);
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialPaymentMethod);
  const [fromAccountId, setFromAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState<string>(accounts[1]?.id ?? "");
  const [projectTag, setProjectTag] = useState<string>("");

  const descId = useId();
  const amountId = useId();
  const dateId = useId();
  const accountFieldId = useId();
  const fromFieldId = useId();
  const toFieldId = useId();
  const priorityGroupId = useId();
  const statusGroupId = useId();
  const paymentGroupId = useId();
  const projectTagFieldId = useId();
  const projectTagListId = useId();

  const isTransfer = type === "transfer";
  const needsTwoAccounts = isTransfer;
  // userId 已不再 gate — server action 走 DB DEFAULT auth.uid()，
  // proxy 也已保證未登入無法到這裡。只擋「沒帳戶 / 轉帳缺第二帳戶」這種真實業務阻塞。
  const disabled =
    accounts.length === 0 || (needsTwoAccounts && accounts.length < 2);

  function resetForm() {
    setType(INITIAL_TYPE);
    setDescription("");
    setAmount("");
    setPriority(INITIAL_PRIORITY);
    setStatus(INITIAL_STATUS);
    setDate(todayIsoDate());
    setAccountId(accounts[0]?.id ?? "");
    setPaymentMethod(initialPaymentMethod());
    setFromAccountId(accounts[0]?.id ?? "");
    setToAccountId(accounts[1]?.id ?? "");
    setProjectTag("");
  }

  // 雙向綁定：選帳戶 -> 同步 paymentMethod
  function handleAccountChange(id: string) {
    setAccountId(id);
    const acc = accounts.find((a) => a.id === id);
    if (acc) setPaymentMethod(ACCOUNT_TYPE_TO_PAYMENT[acc.type]);
  }

  // 雙向綁定：選 paymentMethod -> 若 current account type 不匹配，切到第一個 matching 帳戶
  function handlePaymentMethodChange(pm: PaymentMethod) {
    setPaymentMethod(pm);
    const wantType = PAYMENT_TO_ACCOUNT_TYPE[pm];
    const currentAcc = accounts.find((a) => a.id === accountId);
    if (!currentAcc || currentAcc.type !== wantType) {
      const next = accounts.find((a) => a.type === wantType);
      if (next) setAccountId(next.id);
    }
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) resetForm();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number.parseFloat(amount);

    if (isTransfer) {
      if (fromAccountId === toAccountId) {
        toast.error("轉出與轉入帳戶不能相同");
        return;
      }
      const payload: CreateTransferInput = {
        fromAccountId,
        toAccountId,
        description,
        amount: parsedAmount,
        status,
        date,
        projectTag: projectTag || null,
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
      accountId,
      description,
      amount: parsedAmount,
      type,
      priority,
      paymentMethod,
      status,
      date,
      projectTag: projectTag || null,
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

  // 同上：不再以 userId 擋 trigger；沒帳戶才真的擋（不然開了 dialog 也選不了）
  const triggerDisabled = accounts.length === 0;

  return (
    <>
      {/*
        本來用 <DialogTrigger render={<Button />}> 但 base-ui 1.5 把它跟內層 Button
        合併時，兩邊都跑 useButton() 會搶 onClick → 完全不觸發 open。
        改成跟 EditRecurringDialog 同款：純 <Button onClick> 直接 setOpen，
        Dialog 用 controlled open 顯隱，最穩。
      */}
      {/* Desktop：頁首 pill 按鈕（md+ 顯示） */}
      <Button
        type="button"
        size="lg"
        className="hidden gap-1.5 rounded-full bg-foreground px-4 text-background shadow-sm shadow-foreground/10 hover:bg-foreground/90 md:inline-flex"
        disabled={triggerDisabled}
        onClick={() => handleOpenChange(true)}
      >
        <Plus className="size-4" />
        快速記帳
      </Button>

      {/* Mobile：右下角 Extended FAB（md 以下顯示）
          透過 createPortal 渲染到 document.body，跳脫父層 <PageTransition>
          (framer-motion motion.div 會留下 inline transform) 造成的 stacking
          context — 否則 fixed + z-50 會被困在區域 context 內，反被 z-30 的
          底部 tab bar 蓋住 → 看得到但點不到。
          bottom 用 calc(5rem + safe-area-inset-bottom) 保證浮在 h-16 tab bar 之上。 */}
      <BodyPortal>
        <Button
          type="button"
          aria-label="快速記帳"
          className="fixed right-5 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 h-14 gap-2 rounded-full bg-foreground pr-6 pl-5 text-base font-semibold text-background shadow-lg shadow-foreground/25 ring-1 ring-foreground/10 hover:bg-foreground/90 md:hidden [&_svg:not([class*='size-'])]:size-5"
          disabled={triggerDisabled}
          onClick={() => handleOpenChange(true)}
        >
          <Plus strokeWidth={2.5} />
          記帳
        </Button>
      </BodyPortal>

      <Dialog open={open} onOpenChange={handleOpenChange}>
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
              {/* active 時依 type 切換配色：expense rose / income emerald / transfer 中性 — 一眼看出當前模式 */}
              <TabsTrigger
                value="expense"
                className="gap-1.5 data-[state=active]:text-rose-600 dark:data-[state=active]:text-rose-400"
              >
                <TrendingDown className="size-3.5" /> 支出
              </TabsTrigger>
              <TabsTrigger
                value="income"
                className="gap-1.5 data-[state=active]:text-emerald-400"
              >
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

          {/* 支出屬性只對 expense 有意義 — income 是「進來的錢」沒有必要 / 非必要之分 */}
          {type === "expense" && (
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
            <div className="grid gap-3">
              {/* 付款方式 Segmented Control — 跟扣款帳戶雙向綁定 */}
              <div className="grid gap-1.5">
                <Label id={paymentGroupId}>
                  {type === "income" ? "收款方式" : "付款方式"}
                </Label>
                <div
                  role="radiogroup"
                  aria-labelledby={paymentGroupId}
                  className="grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-1 ring-1 ring-foreground/5"
                >
                  <PaymentMethodPill
                    value="cash"
                    label="現金"
                    icon={<Banknote className="size-3.5" />}
                    current={paymentMethod}
                    disabled={!accounts.some((a) => a.type === "cash")}
                    onSelect={handlePaymentMethodChange}
                  />
                  <PaymentMethodPill
                    value="credit_card"
                    label="刷卡"
                    icon={<CreditCard className="size-3.5" />}
                    current={paymentMethod}
                    disabled={!accounts.some((a) => a.type === "credit_card")}
                    onSelect={handlePaymentMethodChange}
                  />
                  <PaymentMethodPill
                    value="transfer"
                    label="轉帳"
                    icon={<Landmark className="size-3.5" />}
                    current={paymentMethod}
                    disabled={!accounts.some((a) => a.type === "bank")}
                    onSelect={handlePaymentMethodChange}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
              <Label htmlFor={accountFieldId}>
                {type === "income" ? "入帳" : "扣款"}帳戶
              </Label>
              {accounts.length > 0 ? (
                <Select
                  value={accountId}
                  onValueChange={(v) => handleAccountChange(v as string)}
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
            </div>
          )}

          {/*
            🏷️ 歸屬專案標籤 — 給「太太醫療 / 新居家電 / 大型轉帳」這種非經常性
            重大開銷打烙印；空白等於日常，不出現在分析頁的歸檔區。
            走 native datalist 自動完成：使用者打過的 tag 會浮在下拉裡，減少
            typo + 鼓勵重複使用同一組 tag（讓 archive group 才有意義）。
          */}
          <div className="grid gap-1.5">
            <Label htmlFor={projectTagFieldId}>
              歸屬專案標籤
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                （選填）
              </span>
            </Label>
            <Input
              id={projectTagFieldId}
              type="text"
              value={projectTag}
              onChange={(e) => setProjectTag(e.target.value)}
              placeholder="選填，例如：太太醫療、新居家電"
              autoComplete="off"
              spellCheck={false}
              list={
                projectTagSuggestions && projectTagSuggestions.length > 0
                  ? projectTagListId
                  : undefined
              }
            />
            {projectTagSuggestions && projectTagSuggestions.length > 0 && (
              <datalist id={projectTagListId}>
                {projectTagSuggestions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            )}
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
            {/* income 模式 → 主按鈕綠色 SaaS 感；expense / transfer 維持預設 primary */}
            <Button
              type="submit"
              disabled={pending || disabled}
              className={
                type === "income"
                  ? "bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-500 dark:hover:bg-emerald-500/90"
                  : undefined
              }
            >
              {pending ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  儲存中
                </>
              ) : isTransfer ? (
                "建立轉帳"
              ) : type === "income" ? (
                "新增收入"
              ) : (
                "新增交易"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 把 children portal 到 document.body — 跳出任何祖先建立的 stacking context
 * 或 transform 容器（例如 framer-motion 的 motion.div）。SSR-safe：先 render
 * null，mount 後再 portal，避免 hydration mismatch。
 */
function BodyPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

interface ChoiceProps<T extends string> {
  value: T;
  label: string;
  hint: string;
  current: T;
  onSelect: (v: T) => void;
}

interface PaymentMethodPillProps {
  value: PaymentMethod;
  label: string;
  icon: React.ReactNode;
  current: PaymentMethod;
  disabled?: boolean;
  onSelect: (v: PaymentMethod) => void;
}

function PaymentMethodPill({
  value,
  label,
  icon,
  current,
  disabled = false,
  onSelect,
}: PaymentMethodPillProps) {
  const active = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={() => onSelect(value)}
      data-state={active ? "active" : "inactive"}
      className="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-foreground/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
    >
      {icon}
      {label}
    </button>
  );
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
