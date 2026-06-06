"use client";

/**
 * 淨資產資產 / 負債兩欄式清單 — 含 hover-revealed 編輯入口 + 編輯彈窗
 *（內嵌 🗑️ 刪除二次確認）。
 *
 * 設計重點:
 *   1) Controlled open（per memory: base-ui DialogTrigger 失效）— pencil
 *      onClick 設 editing account state；同樣 setDeletingAccount 開二次確認
 *   2) EditDialog 同時編輯 name/type + 最新估值金額。submit 邏輯：
 *      - 只改 name/type → updateWealthAccount(todayValue=undefined)，不動 snapshot
 *      - 改了金額（不同於目前 value）→ todayValue 帶值 → server 端 UPSERT 今日
 *        snapshot，其他帳戶值從上一筆 snapshot 承襲
 *   3) Delete 從 EditDialog 左下角入口開出二次確認 dialog；warning 文案點明
 *      「歷史快照中的紀錄不會被擦除」— 保護趨勢圖數據完整性
 *   4) router.refresh() → /net-worth RSC 重抓 → 三大數據卡 (NetWorthCards)
 *      / AssetAllocationCard 圓餅 / 趨勢圖全部同步動畫更新
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
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
  deleteWealthAccount,
  updateWealthAccount,
} from "@/lib/actions/wealth";
import {
  formatTwd,
  type DisplayAccount,
  type WealthAccountType,
} from "@/lib/wealth";

interface Props {
  accounts: DisplayAccount[];
}

const TYPE_LABEL: Record<WealthAccountType, string> = {
  asset: "資產",
  liability: "負債",
};

export function WealthAccountsList({ accounts }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Dialog state — 共用 edit + delete confirm；同時 active 一個
  const [editing, setEditing] = useState<DisplayAccount | null>(null);
  const [deletingTarget, setDeletingTarget] = useState<DisplayAccount | null>(
    null
  );

  // Draft form state for edit dialog
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<WealthAccountType>("asset");
  const [draftValue, setDraftValue] = useState<string>("");

  function openEdit(acc: DisplayAccount) {
    setEditing(acc);
    setDraftName(acc.name);
    setDraftType(acc.type);
    setDraftValue(acc.value === null ? "" : String(acc.value));
  }

  function closeEdit() {
    if (pending) return; // 防止 transition 中關掉 dialog
    setEditing(null);
  }

  function handleSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const name = draftName.trim();
    if (!name) {
      toast.error("請輸入帳戶名稱");
      return;
    }
    const trimmedValue = draftValue.trim();
    const parsedValue = trimmedValue === "" ? null : Number(trimmedValue);
    if (parsedValue !== null && !Number.isFinite(parsedValue)) {
      toast.error("金額格式無效");
      return;
    }
    if (parsedValue !== null && parsedValue < 0) {
      toast.error("金額必須是 0 或正數");
      return;
    }

    // 只有當金額確實變動時才傳 todayValue（避免「我只是改名」誤動 snapshot）
    const valueChanged =
      parsedValue !== null && parsedValue !== editing.value;
    const target = editing;

    startTransition(async () => {
      const result = await updateWealthAccount({
        id: target.id,
        name,
        type: draftType,
        todayValue: valueChanged ? parsedValue : undefined,
      });
      if (!result.ok) {
        toast.error("儲存失敗", { description: result.error });
        return;
      }
      toast.success(
        valueChanged
          ? `已更新【${name}】並寫入今日快照`
          : `已更新【${name}】`
      );
      setEditing(null);
      router.refresh();
    });
  }

  function openDeleteConfirm() {
    if (!editing) return;
    const target = editing;
    setEditing(null); // 關 edit dialog，避免兩個彈窗疊
    // 微延遲讓關 dialog 動畫先跑，再開 confirm，視覺乾淨
    setTimeout(() => setDeletingTarget(target), 80);
  }

  function handleConfirmDelete() {
    if (!deletingTarget) return;
    const target = deletingTarget;
    startTransition(async () => {
      const result = await deleteWealthAccount(target.id);
      if (!result.ok) {
        toast.error("刪除失敗", { description: result.error });
        return;
      }
      toast.success(`已刪除【${target.name}】`);
      setDeletingTarget(null);
      router.refresh();
    });
  }

  const assets = accounts.filter((a) => a.type === "asset");
  const liabilities = accounts.filter((a) => a.type === "liability");

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
          還沒設定任何財富帳戶。點上方「📸 更新本月資產快照」開始建立。
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <section
        aria-label="財富帳戶清單"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <AccountColumn
          title="資產"
          subtitle="存款、投資、不動產等正資產"
          icon={<TrendingUp className="size-4 text-emerald-400" />}
          items={assets}
          emptyHint="尚未建立任何資產帳戶"
          tone="positive"
          onEdit={openEdit}
        />
        <AccountColumn
          title="負債"
          subtitle="房貸、車貸、信用卡循環等"
          icon={
            <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />
          }
          items={liabilities}
          emptyHint="尚未建立任何負債帳戶"
          tone="danger"
          onEdit={openEdit}
        />
      </section>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              編輯{editing ? TYPE_LABEL[editing.type] : "資產"} — {editing?.name}
            </DialogTitle>
            <DialogDescription>
              改名稱、切類型，或更新最新估值金額。金額變動會寫入今日快照（覆蓋當天既有快照，其他帳戶值從上一筆承襲）。
            </DialogDescription>
          </DialogHeader>

          <form
            id="wealth-edit-form"
            onSubmit={handleSubmitEdit}
            className="flex flex-col gap-4"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="wealth-name">帳戶名稱</Label>
              <Input
                id="wealth-name"
                required
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="wealth-type">類型</Label>
              <Select
                value={draftType}
                onValueChange={(v) =>
                  setDraftType(v as WealthAccountType)
                }
              >
                <SelectTrigger id="wealth-type" className="w-full">
                  <SelectValue>
                    {(v) =>
                      typeof v === "string" && v in TYPE_LABEL
                        ? TYPE_LABEL[v as WealthAccountType]
                        : "選擇類型"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">資產</SelectItem>
                  <SelectItem value="liability">負債</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="wealth-value">最新估值金額</Label>
              <div className="relative">
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-muted-foreground"
                >
                  $
                </span>
                <Input
                  id="wealth-value"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  min="0"
                  value={draftValue}
                  onChange={(e) => setDraftValue(e.target.value)}
                  placeholder={editing?.value === null ? "尚未拍攝" : "0"}
                  className="pl-7 text-base font-medium tabular-nums tracking-tight"
                />
              </div>
              {editing && (
                <p className="flex items-baseline justify-between text-[11px] text-muted-foreground/70">
                  <span>目前最新估值</span>
                  <span className="tabular-nums text-foreground/80">
                    {editing.value === null ? (
                      "—（尚未拍攝）"
                    ) : (
                      <Money value={editing.value} format={formatTwd} />
                    )}
                  </span>
                </p>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                金額不動就空著 → 只改名稱不會建立任何快照，趨勢圖完全不受影響。
              </p>
            </div>
          </form>

          <DialogFooter className="!justify-between sm:!justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={openDeleteConfirm}
              disabled={pending}
              className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
            >
              <Trash2 className="size-3.5" />
              刪除
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeEdit}
                disabled={pending}
              >
                取消
              </Button>
              <Button
                type="submit"
                form="wealth-edit-form"
                disabled={pending || !draftName.trim()}
              >
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                {pending ? "儲存中..." : "儲存變更"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm dialog (二次確認，防誤刪) ── */}
      <Dialog
        open={!!deletingTarget}
        onOpenChange={(o) => !o && !pending && setDeletingTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-rose-600 dark:text-rose-400">
              確認刪除 {deletingTarget ? TYPE_LABEL[deletingTarget.type] : ""}
              {" — "}
              {deletingTarget?.name}
            </DialogTitle>
            <DialogDescription>
              此操作不可復原。刪除後：
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current" />
              <span>此帳戶今後不會出現在資產 / 負債清單。</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current" />
              <span>
                <span className="font-medium text-foreground/80">
                  歷史快照中的紀錄不會被擦除
                </span>{" "}
                — 過去的趨勢圖數值維持原樣，不會因為刪戶被回頭改寫。
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current" />
              <span>
                之後拍新快照時，這個帳戶不會再被列入，總資產 / 負債會自動排除它。
              </span>
            </li>
          </ul>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingTarget(null)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleConfirmDelete}
              disabled={pending}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500"
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              {pending ? "刪除中..." : "確認刪除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────────── Column (per type) ─────────────────── */

interface ColumnProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: DisplayAccount[];
  emptyHint: string;
  tone: "positive" | "danger";
  onEdit: (acc: DisplayAccount) => void;
}

const TONE_VALUE: Record<ColumnProps["tone"], string> = {
  positive: "text-emerald-400",
  danger: "text-rose-600 dark:text-rose-400",
};

function AccountColumn({
  title,
  subtitle,
  icon,
  items,
  emptyHint,
  tone,
  onEdit,
}: ColumnProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
            {emptyHint}
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((acc) => (
              <li
                key={acc.id}
                className="group flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {acc.name}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      acc.value === null
                        ? "text-muted-foreground/60"
                        : TONE_VALUE[tone]
                    }`}
                  >
                    {acc.value === null ? (
                      "—"
                    ) : (
                      <Money value={acc.value} format={formatTwd} />
                    )}
                  </span>
                  {/*
                    編輯入口 — 桌面 hover-revealed (group-hover) 維持平時清爽；
                    行動端 max-sm:opacity-100 永遠可點（觸控無 hover 概念）。
                  */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`編輯 ${acc.name}`}
                    onClick={() => onEdit(acc)}
                    className="shrink-0 text-muted-foreground/70 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 max-sm:opacity-100"
                  >
                    <Pencil className="size-3" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
