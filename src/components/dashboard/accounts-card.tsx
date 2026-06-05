"use client";

/**
 * 帳戶管理中樞 — /settings 的核心 CRUD 模組。
 *
 * 結構:
 *   列表（左 icon + name + type chip / 右 balance + edit/delete）
 *   +「新增帳戶」按鈕
 *   Dialog: 新增 / 編輯（含內嵌資產校正） / 刪除確認（含孤兒交易警告）
 *
 * 設計重點:
 *   1) Controlled open 三種 dialog（per memory: base-ui DialogTrigger 失效）
 *   2) Edit dialog 一鍵 save 偵測 name/type 變動 → updateAccount；balance 變動
 *      → calibrateAccountBalance（純覆寫不污染圖表）。兩個 action 解耦但 UX
 *      一鍵完成
 *   3) Delete 先 query transactions 筆數 → dialog 顯示「N 筆將孤兒化」警告
 *      → confirm 後才執行（不可逆）
 *   4) router.refresh() 觸發 RSC 重抓，列表與首頁 plates 同步更新
 *   5) Apple 暗黑工業風 — icon 用 lucide、type chip 用淡 ring、edit/delete 行動
 *      按鈕配色冷靜
 */

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import {
  Banknote,
  CreditCard,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Wallet,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import {
  calibrateAccountBalance,
  createAccount,
  deleteAccount,
  getAccountTransactionCount,
  updateAccount,
} from "@/lib/actions/accounts";
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
import { Money } from "@/components/ui/money";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatCurrency,
  num,
  type AccountRow,
  type AccountType,
} from "@/lib/dashboard";

const ACCOUNT_TYPE_ICON: Record<AccountType, typeof Banknote> = {
  cash: Banknote,
  credit_card: CreditCard,
  bank: Landmark,
};

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: "現金",
  credit_card: "信用卡",
  bank: "銀行",
};

interface Props {
  accounts: AccountRow[];
}

interface DraftState {
  id?: string;
  name: string;
  type: AccountType;
  /** 字串給 input 用；submit 時 Number() */
  balance: string;
  /** 記原始 balance — submit 時用來判斷有沒有變動，避免無謂 calibrate call */
  originalBalance: number;
}

const BLANK_DRAFT: DraftState = {
  name: "",
  type: "bank",
  balance: "",
  originalBalance: 0,
};

export function AccountsCard({ accounts }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(BLANK_DRAFT);

  // Delete flow 獨立 state — 不混進 edit dialog 避免 race condition
  const [deletingAccount, setDeletingAccount] = useState<AccountRow | null>(null);
  const [orphanCount, setOrphanCount] = useState<number | null>(null);

  const isEdit = !!draft.id;

  function openCreate() {
    setDraft({ ...BLANK_DRAFT, balance: "0" });
    setDialogOpen(true);
  }

  function openEdit(account: AccountRow) {
    const bal = num(account.balance);
    setDraft({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: String(bal),
      originalBalance: bal,
    });
    setDialogOpen(true);
  }

  function openDelete(account: AccountRow) {
    setDeletingAccount(account);
    setOrphanCount(null); // reset, fetch in effect
  }

  // 開啟 delete dialog → 撈該戶綁定的 transactions 筆數
  useEffect(() => {
    if (!deletingAccount) return;
    let cancelled = false;
    getAccountTransactionCount(deletingAccount.id).then((n) => {
      if (!cancelled) setOrphanCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [deletingAccount]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      toast.error("請輸入帳戶名稱");
      return;
    }
    const balanceNum = Number(draft.balance);
    if (!Number.isFinite(balanceNum)) {
      toast.error("餘額格式無效");
      return;
    }

    startTransition(async () => {
      if (isEdit && draft.id) {
        // EDIT: 偵測哪些欄位變了，個別 call 對應 action
        const nameOrTypeChanged =
          name !== accounts.find((a) => a.id === draft.id)?.name ||
          draft.type !== accounts.find((a) => a.id === draft.id)?.type;
        const balanceChanged = balanceNum !== draft.originalBalance;

        if (nameOrTypeChanged) {
          const r = await updateAccount({ id: draft.id, name, type: draft.type });
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
        }
        if (balanceChanged) {
          const r = await calibrateAccountBalance(draft.id, balanceNum);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
        }
        if (!nameOrTypeChanged && !balanceChanged) {
          toast.info("沒有任何欄位變動");
          setDialogOpen(false);
          return;
        }
        toast.success(`已更新【${name}】`);
      } else {
        // CREATE
        const r = await createAccount({
          name,
          type: draft.type,
          initialBalance: balanceNum,
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success(`已新增帳戶【${name}】`);
      }
      setDialogOpen(false);
      router.refresh();
    });
  }

  function handleConfirmDelete() {
    if (!deletingAccount) return;
    const target = deletingAccount;
    startTransition(async () => {
      const r = await deleteAccount(target.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`已刪除帳戶【${target.name}】`);
      setDeletingAccount(null);
      router.refresh();
    });
  }

  // 列表 sort：cash 永遠最後、其他依 name 字典序
  const sorted = [...accounts].sort((a, b) => {
    if (a.type === "cash" && b.type !== "cash") return 1;
    if (a.type !== "cash" && b.type === "cash") return -1;
    return a.name.localeCompare(b.name);
  });

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4 text-muted-foreground" />
            帳戶管理
          </CardTitle>
          <CardDescription className="mt-1">
            新增、編輯、刪除你的所有帳戶。餘額校正不會新增任何交易，不會污染圖表。
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openCreate}
          className="shrink-0 gap-1"
        >
          <Plus className="size-4" />
          新增帳戶
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {sorted.length === 0 ? (
          <p className="rounded-lg border border-dashed border-foreground/15 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            還沒任何帳戶，點上方「新增帳戶」開始。
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-foreground/5 rounded-xl ring-1 ring-foreground/10">
            {sorted.map((a) => {
              const Icon = ACCOUNT_TYPE_ICON[a.type] ?? Wallet;
              const balance = num(a.balance);
              const isNegative = balance < 0;
              return (
                <li
                  key={a.id}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-foreground/10">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] ring-1 ring-foreground/10">
                        {ACCOUNT_TYPE_LABEL[a.type]}
                      </span>
                      {a.code && (
                        <span className="ml-1.5 font-mono opacity-60">
                          {a.code}
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-medium tabular-nums ${
                      isNegative
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-foreground/90"
                    }`}
                  >
                    <Money value={balance} />
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`編輯 ${a.name}`}
                      onClick={() => openEdit(a)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`刪除 ${a.name}`}
                      onClick={() => openDelete(a)}
                      className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {/* ── Create / Edit dialog ── */}
      <AccountFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        setDraft={setDraft}
        isEdit={isEdit}
        pending={pending}
        onSubmit={handleSubmit}
      />

      {/* ── Delete confirm dialog ── */}
      <DeleteConfirmDialog
        account={deletingAccount}
        orphanCount={orphanCount}
        pending={pending}
        onCancel={() => setDeletingAccount(null)}
        onConfirm={handleConfirmDelete}
      />
    </Card>
  );
}

/* ─────────────────── Sub-component: Form Dialog ─────────────────── */

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  isEdit: boolean;
  pending: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

function AccountFormDialog({
  open,
  onOpenChange,
  draft,
  setDraft,
  isEdit,
  pending,
  onSubmit,
}: FormDialogProps) {
  const nameId = useId();
  const typeId = useId();
  const balanceId = useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `編輯帳戶 — ${draft.name}` : "新增帳戶"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "改名、改類型，或在下方校正餘額。餘額調整為純覆寫，不會新增交易明細。"
              : "建立新帳戶並填入當前實際餘額作為初始狀態。"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" id="account-form">
          <div className="grid gap-1.5">
            <Label htmlFor={nameId}>帳戶名稱</Label>
            <Input
              id={nameId}
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例：台新生活戶"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={typeId}>類型</Label>
            <Select
              value={draft.type}
              onValueChange={(v) => setDraft({ ...draft, type: v as AccountType })}
            >
              <SelectTrigger id={typeId} className="w-full">
                <SelectValue>
                  {(v) =>
                    typeof v === "string" && v in ACCOUNT_TYPE_LABEL
                      ? ACCOUNT_TYPE_LABEL[v as AccountType]
                      : "選擇類型"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">銀行（網銀 / 匯款 / 信用扣繳）</SelectItem>
                <SelectItem value="credit_card">信用卡</SelectItem>
                <SelectItem value="cash">現金錢包</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={balanceId} className="flex items-center gap-1.5">
              <Wrench className="size-3.5 text-muted-foreground" />
              {isEdit ? "資產校正水位" : "初始餘額"}
            </Label>
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-muted-foreground"
              >
                $
              </span>
              <Input
                id={balanceId}
                type="number"
                step="any"
                inputMode="decimal"
                value={draft.balance}
                onChange={(e) => setDraft({ ...draft, balance: e.target.value })}
                className="pl-7 text-base font-medium tabular-nums tracking-tight"
                placeholder="0"
              />
            </div>
            {isEdit && (
              <p className="flex items-baseline justify-between text-[11px] text-muted-foreground/70">
                <span>目前餘額</span>
                <span className="tabular-nums text-foreground/80">
                  {formatCurrency(draft.originalBalance)}
                </span>
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground/70">
              此欄位為純粹的數字校正，不會新增任何 transaction，不影響你的月度收支與儲蓄率圖表。
            </p>
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            取消
          </Button>
          <Button type="submit" form="account-form" disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {pending ? "處理中..." : isEdit ? "儲存變更" : "建立帳戶"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────── Sub-component: Delete confirm ─────────────────── */

function DeleteConfirmDialog({
  account,
  orphanCount,
  pending,
  onCancel,
  onConfirm,
}: {
  account: AccountRow | null;
  orphanCount: number | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const open = !!account;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-rose-600 dark:text-rose-400">
            刪除帳戶 — {account?.name}
          </DialogTitle>
          <DialogDescription>
            此操作不可復原。帳戶刪除後：
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current" />
            <span>
              {orphanCount === null ? (
                <span className="text-muted-foreground/60">統計交易筆數中...</span>
              ) : orphanCount === 0 ? (
                <span>此帳戶沒有任何交易，可安全刪除。</span>
              ) : (
                <span>
                  <span className="font-semibold text-foreground">{orphanCount}</span>{" "}
                  筆交易明細將失去帳戶歸屬（保留在系統中但 account_id 變為 NULL）。
                </span>
              )}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current" />
            <span>分類預設帳戶 / Profile 預設帳戶若指向此戶，將被清空。</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current" />
            <span>戰情室板塊綁定此戶的關聯也會被一併移除。</span>
          </li>
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            取消
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={pending || orphanCount === null}
            className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {pending ? "刪除中..." : "確認刪除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
