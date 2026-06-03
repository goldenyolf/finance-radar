"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  Banknote,
  Check,
  CreditCard,
  Landmark,
  LayoutGrid,
  Loader2Icon,
  Pencil,
  Plus,
  Trash2,
  Wallet,
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
import { getAccountLabel } from "@/lib/account-display";
import {
  createDashboardPlate,
  deleteDashboardPlate,
  updateDashboardPlate,
} from "@/lib/actions/dashboard-plates";
import {
  DASHBOARD_PLATES_MAX,
  type DashboardPlateRow,
} from "@/lib/dashboard-plates";
import type { AccountRow, AccountType } from "@/lib/dashboard";

interface Props {
  plates: DashboardPlateRow[];
  accounts: AccountRow[];
}

interface DraftState {
  id?: string;
  name: string;
  description: string;
  /** N:1 multi-binding (per 0013)；空陣列 = 未綁定 */
  linkedAccountIds: string[];
}

const BLANK_DRAFT: DraftState = {
  name: "",
  description: "",
  linkedAccountIds: [],
};

/** account.type 對應的 lucide icon — 跟 Quick Add Segmented / 明細 badge 同套，視覺一致。 */
const ACCOUNT_TYPE_ICON: Record<AccountType, typeof Banknote> = {
  cash: Banknote,
  credit_card: CreditCard,
  bank: Landmark,
};

/**
 * 🧱 戰情室板塊配置 — Settings 頁的子卡。
 *
 * 取代寫死的 BoardKey enum：讓使用者自訂首頁要看哪幾個板塊、每塊綁哪個
 * cash flow account。上限 4 個（首頁版位有限）。
 *
 * 模式：list + 單一 Dialog 切 create/edit（用 draft.id 判斷）— 比兩個
 * 獨立 dialog 少寫一半 boilerplate。
 *
 * Dialog 全部走 controlled open + 純 <Button onClick> — 避開 base-ui 1.5 的
 * DialogTrigger 地雷（render={<Button/>} 會 silent 失敗）。
 */
export function DashboardPlatesCard({ plates, accounts }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(BLANK_DRAFT);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isEdit = !!draft.id;
  const atLimit = plates.length >= DASHBOARD_PLATES_MAX;

  function openCreate() {
    if (atLimit) return;
    setDraft(BLANK_DRAFT);
    setDialogOpen(true);
  }

  function openEdit(plate: DashboardPlateRow) {
    setDraft({
      id: plate.id,
      name: plate.name,
      description: plate.description,
      linkedAccountIds: [...(plate.linked_account_ids ?? [])],
    });
    setDialogOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      name: draft.name,
      description: draft.description,
      linkedAccountIds: draft.linkedAccountIds,
    };
    startTransition(async () => {
      const result = draft.id
        ? await updateDashboardPlate({ ...payload, id: draft.id })
        : await createDashboardPlate(payload);
      if (!result.ok) {
        toast.error(draft.id ? "更新失敗" : "新增失敗", {
          description: result.error,
        });
        return;
      }
      toast.success(draft.id ? "已更新板塊" : "已新增板塊", {
        description: draft.name,
      });
      setDialogOpen(false);
      router.refresh();
    });
  }

  function handleDelete(plate: DashboardPlateRow) {
    if (deletingId) return;
    if (!window.confirm(`確定要刪除「${plate.name}」這個板塊嗎？`)) return;
    setDeletingId(plate.id);
    startTransition(async () => {
      const result = await deleteDashboardPlate(plate.id);
      setDeletingId(null);
      if (!result.ok) {
        toast.error("刪除失敗", { description: result.error });
        return;
      }
      toast.success("已刪除板塊", { description: plate.name });
      router.refresh();
    });
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">🧱 戰情室板塊配置</CardTitle>
            </div>
            <CardDescription className="mt-1">
              首頁顯示的板塊（家庭 / 補助 / 個人之類）。每個板塊可綁一個
              cash flow 帳戶。最多 {DASHBOARD_PLATES_MAX} 個 — 超過會擠壓
              首頁版位。
            </CardDescription>
          </div>
          <Button
            type="button"
            size="lg"
            className="gap-1.5 rounded-full"
            onClick={openCreate}
            disabled={atLimit}
            title={atLimit ? `已達 ${DASHBOARD_PLATES_MAX} 個上限` : undefined}
          >
            <Plus className="size-4" />
            新增板塊
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {plates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
            還沒有任何板塊 — 點右上「新增板塊」開始
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {plates.map((plate) => (
              <PlateRowItem
                key={plate.id}
                plate={plate}
                boundAccounts={resolveBoundAccounts(plate.linked_account_ids, accounts)}
                onEdit={() => openEdit(plate)}
                onDelete={() => handleDelete(plate)}
                deleting={deletingId === plate.id}
              />
            ))}
          </ul>
        )}
        {atLimit && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            已達 {DASHBOARD_PLATES_MAX} 個板塊上限。要新增請先刪除其他板塊。
          </p>
        )}
      </CardContent>

      <PlateDialog
        open={dialogOpen}
        onOpenChange={(v) => !pending && setDialogOpen(v)}
        draft={draft}
        setDraft={setDraft}
        accounts={accounts}
        pending={pending}
        onSubmit={handleSubmit}
        isEdit={isEdit}
      />
    </Card>
  );
}

/* ─────────────────── helpers ─────────────────── */

/**
 * 把 plate.linked_account_ids 投射成實際 AccountRow 陣列。找不到的 id 視為
 * 帳戶已被刪 — 用 placeholder 標記，PlateRowItem 會顯示「（已刪除）」chip。
 */
interface BoundAccount {
  id: string;
  name: string;
  type: AccountType | null; // null = 已刪除
}
function resolveBoundAccounts(
  ids: string[],
  accounts: AccountRow[]
): BoundAccount[] {
  return ids.map((id) => {
    const a = accounts.find((x) => x.id === id);
    return a
      ? { id: a.id, name: a.name, type: a.type }
      : { id, name: "（已刪除）", type: null };
  });
}

/* ─────────────────── Row ─────────────────── */

interface RowProps {
  plate: DashboardPlateRow;
  boundAccounts: BoundAccount[];
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function PlateRowItem({
  plate,
  boundAccounts,
  onEdit,
  onDelete,
  deleting,
}: RowProps) {
  return (
    <li
      className="group grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 rounded-lg border border-foreground/5 bg-card px-3 py-2.5 hover:bg-muted/40 sm:border-transparent sm:bg-transparent sm:p-2"
    >
      <div className="min-w-0 space-y-1.5">
        <p className="truncate text-sm font-semibold">{plate.name}</p>
        {plate.description && (
          <p className="line-clamp-2 text-[11px] text-muted-foreground">
            {plate.description}
          </p>
        )}
        {boundAccounts.length === 0 ? (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Wallet className="size-3" />
            <span className="italic text-muted-foreground/70">未綁定帳戶</span>
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {boundAccounts.map((b) => {
              const Icon = b.type ? ACCOUNT_TYPE_ICON[b.type] : Wallet;
              return (
                <span
                  key={b.id}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ring-1 ${
                    b.type
                      ? "bg-foreground/[0.04] text-muted-foreground ring-foreground/10"
                      : "bg-rose-500/5 text-rose-600 ring-rose-500/20 dark:text-rose-400"
                  }`}
                >
                  <Icon className="size-2.5" />
                  {b.name}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions：行動版永遠顯示，sm+ hover-reveal */}
      <div className="flex items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`編輯 ${plate.name}`}
          onClick={onEdit}
          className="text-muted-foreground hover:text-foreground"
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`刪除 ${plate.name}`}
          onClick={onDelete}
          disabled={deleting}
          className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
        >
          {deleting ? <Loader2Icon className="animate-spin" /> : <Trash2 />}
        </Button>
      </div>
    </li>
  );
}

/* ─────────────────── Dialog（create + edit 共用） ─────────────────── */

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

function PlateDialog({
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
  const descId = useId();
  const accGroupId = useId();

  function toggleAccount(id: string) {
    const set = new Set(draft.linkedAccountIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setDraft({ ...draft, linkedAccountIds: [...set] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "編輯板塊" : "新增板塊"}</DialogTitle>
          <DialogDescription>
            板塊代表首頁上的一個獨立財務區塊；綁定帳戶後，該板塊的收支
            metrics 會從綁定的帳戶計算。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={nameId}>板塊名稱</Label>
            <Input
              id={nameId}
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例：家庭財務、補助金流"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={descId}>敘述（可選）</Label>
            <textarea
              id={descId}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              rows={2}
              placeholder="例：共同帳戶 — 房貸、托育、學費、子女花費"
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="grid gap-1.5">
            <Label id={accGroupId}>關聯帳戶（可複選）</Label>
            {accounts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-input px-3 py-2 text-xs text-muted-foreground">
                目前尚未建立任何帳戶，請先到 Supabase 新增 accounts。
              </p>
            ) : (
              <div
                role="group"
                aria-labelledby={accGroupId}
                className="flex flex-col gap-1.5 rounded-lg bg-muted/30 p-2 ring-1 ring-foreground/5"
              >
                {accounts.map((a) => {
                  const selected = draft.linkedAccountIds.includes(a.id);
                  const Icon = ACCOUNT_TYPE_ICON[a.type] ?? Wallet;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() => toggleAccount(a.id)}
                      data-state={selected ? "selected" : "unselected"}
                      className="group/chip flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-foreground/[0.04] data-[state=selected]:bg-foreground/[0.06] data-[state=selected]:ring-1 data-[state=selected]:ring-foreground/15"
                    >
                      <span
                        aria-hidden
                        className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-muted-foreground group-data-[state=selected]/chip:bg-foreground group-data-[state=selected]/chip:text-background"
                      >
                        {selected ? (
                          <Check className="size-3" strokeWidth={3} />
                        ) : (
                          <Icon className="size-3" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {getAccountLabel(a.id, a.name)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {draft.linkedAccountIds.length === 0 && accounts.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                未勾選即為「未綁定」 — 首頁該板塊會顯示綁定 CTA。
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
                "新增板塊"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
