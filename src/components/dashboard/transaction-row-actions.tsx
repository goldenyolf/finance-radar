"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  Loader2Icon,
  Pencil,
  Trash2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteTransaction,
  updateTransaction,
} from "@/lib/actions/transactions";
import { getAccountLabel } from "@/lib/account-display";
import type { CategoryRow } from "@/lib/categories";
import type { AccountRow } from "@/lib/dashboard";
import {
  EXPENSE_CATEGORY_LABEL,
  getCategoryLabel,
  type ExpenseCategory,
} from "@/lib/expense-categories";

/** Edit dialog 允許在 income ↔ expense 之間切；transfer 鎖定（要改請刪除重建） */
type EditableType = "income" | "expense";

interface Props {
  transactionId: string;
  title: string;
  amount: number;
  accountId: string | null;
  expenseCategory: ExpenseCategory | null;
  isTransfer: boolean;
  /** 該筆原本的 type — 預填 dialog 的 income/expense tab；transfer 走鎖定狀態 */
  transactionType?: "income" | "expense" | "transfer";
  accounts: AccountRow[];
  /** 動態 categories — 編輯 dialog 的分類下拉用使用者自訂清單；省略時走靜態 7 大類。 */
  categories?: CategoryRow[];
}

const STATIC_CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORY_LABEL) as Array<
  [ExpenseCategory, string]
>;

export function TransactionRowActions({
  transactionId,
  title,
  amount,
  accountId,
  expenseCategory,
  isTransfer,
  transactionType,
  accounts,
  categories,
}: Props) {
  // 推導初始 editable type：transfer 不會被使用者改（dialog 鎖定 income/expense tab）
  // 沒傳 transactionType 時 fallback：有 expenseCategory → expense；否則看 transfer
  const initialEditableType: EditableType =
    transactionType === "income" ? "income" : "expense";
  // 動態下拉：只列出 type='expense' 且有穩定 code 的分類；自訂分類（code=null）
  // 暫不放這裡，因為 transactions.category 還是 ExpenseCategory enum。Phase 5
  // 把欄位改成 category_id UUID 之後，整段就可以平鋪所有 categories。
  const categoryOptions: Array<[ExpenseCategory, string]> = categories
    ? categories
        .filter((c): c is CategoryRow & { code: string } =>
          c.type === "expense" && !!c.code
        )
        .map((c) => [c.code as ExpenseCategory, c.name])
    : STATIC_CATEGORY_OPTIONS;
  const dynamicLabelMap = new Map(categoryOptions);
  const renderCategoryLabel = (value: unknown): string => {
    if (typeof value !== "string" || !value) return "選擇花費類型";
    return (
      dynamicLabelMap.get(value as ExpenseCategory) ?? getCategoryLabel(value)
    );
  };
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const [savePending, startSaveTransition] = useTransition();

  const [draftTitle, setDraftTitle] = useState(title);
  const [draftAmount, setDraftAmount] = useState(String(amount));
  const [draftAccountId, setDraftAccountId] = useState<string>(accountId ?? "");
  const [draftCategory, setDraftCategory] = useState<ExpenseCategory>(
    expenseCategory ?? "other"
  );
  const [draftType, setDraftType] = useState<EditableType>(initialEditableType);

  const titleId = useId();
  const amountId = useId();
  const accountFieldId = useId();
  const categoryFieldId = useId();

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
      // 每次開啟都重置成 row 的當前值，避免上一次未存的草稿污染
      setDraftTitle(title);
      setDraftAmount(String(amount));
      setDraftAccountId(accountId ?? "");
      setDraftCategory(expenseCategory ?? "other");
      setDraftType(initialEditableType);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number.parseFloat(draftAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("金額必須為大於 0 的數字");
      return;
    }
    if (!draftTitle.trim()) {
      toast.error("請輸入項目名稱");
      return;
    }
    // Transfer row 不送 accountId / category / type（server action 也會擋，這裡先擋一層）
    const accountChanged = !isTransfer && draftAccountId !== (accountId ?? "");
    const typeChanged = !isTransfer && draftType !== initialEditableType;
    // income → 強制清 category，不傳 category（server 會自動 null）
    // expense → 只在 category 真的變動才傳
    const categoryChanged =
      !isTransfer &&
      draftType === "expense" &&
      draftCategory !== (expenseCategory ?? "other");

    startSaveTransition(async () => {
      const result = await updateTransaction({
        id: transactionId,
        description: draftTitle,
        amount: parsed,
        accountId: accountChanged ? draftAccountId : undefined,
        category: categoryChanged ? draftCategory : undefined,
        type: typeChanged ? draftType : undefined,
      });
      if (!result.ok) {
        toast.error("更新失敗", { description: result.error });
        return;
      }
      const target = accounts.find((a) => a.id === draftAccountId);
      const targetAccountName = getAccountLabel(draftAccountId, target?.name);
      const movedHint = accountChanged ? `・已移至 ${targetAccountName}` : "";
      toast.success("已更新帳目", {
        description: `${draftTitle.trim()}・NT$ ${parsed.toLocaleString("zh-TW")}${movedHint}`,
      });
      setEditOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {/* 行動版：永久顯示（沒有 hover 概念）；md+：走 hover-reveal 保持桌面乾淨 */}
      <div className="flex items-center gap-0.5 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
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
              {isTransfer
                ? "內部轉帳僅可編輯名稱與金額；帳戶與分類不適用。"
                : "改帳戶後這筆會立刻飛到對應的板塊卡片。"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* type 切換：transfer 鎖定，income/expense 自由互改；切到 income 會自動隱藏「花費類型」欄位（語意上 income 沒分類） */}
            {!isTransfer && (
              <Tabs
                value={draftType}
                onValueChange={(v) => setDraftType(v as EditableType)}
              >
                <TabsList className="grid w-full grid-cols-2">
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
                </TabsList>
              </Tabs>
            )}

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

            {!isTransfer && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor={accountFieldId}>選擇帳戶</Label>
                  {accounts.length > 0 ? (
                    <Select
                      value={draftAccountId}
                      onValueChange={(v) => setDraftAccountId(v as string)}
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
                      尚未建立任何帳戶
                    </p>
                  )}
                </div>

                {/* income 沒有「花費類型」概念 → 整段隱藏；切回 expense 時自動回來 */}
                {draftType === "expense" && (
                <div className="grid gap-1.5">
                  <Label htmlFor={categoryFieldId}>花費類型</Label>
                  <Select
                    value={draftCategory}
                    onValueChange={(v) => setDraftCategory(v as ExpenseCategory)}
                  >
                    <SelectTrigger id={categoryFieldId} className="w-full">
                      <SelectValue placeholder="選擇花費類型">
                        {(v) => renderCategoryLabel(v)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                )}
              </>
            )}

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
