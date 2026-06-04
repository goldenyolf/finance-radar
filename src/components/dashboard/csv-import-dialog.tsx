"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2Icon, ShieldAlert, Sparkles } from "lucide-react";
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
import { Money } from "@/components/ui/money";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAccountLabel } from "@/lib/account-display";
import type { CategoryRow } from "@/lib/categories";
import type { AccountRow } from "@/lib/dashboard";
import {
  confirmImport,
  type ImportPreview,
} from "@/lib/actions/import-transactions";
import {
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/expense-categories";
import { cn } from "@/lib/utils";

interface Props {
  preview: ImportPreview;
  accounts: AccountRow[];
  categories?: CategoryRow[];
  onClose: () => void;
}

/**
 * CSV 匯入預覽 dialog — 表格 + 帳戶選擇 + 分類可改 + 一鍵匯入。
 *
 * 預設選擇邏輯：
 *   - 帳戶：第一個 type='credit_card' 帳戶 (信用卡 CSV 一律歸這類)；
 *           沒信用卡帳戶就退第一個帳戶
 *   - row.status='duplicate' / 'refund' 預設不勾選；'new' 預設勾選
 *   - row.category 預設用 suggestedCategory (classifyByMerchant 輸出)，
 *     使用者可在表格內下拉改
 */
export function CsvImportDialog({
  preview,
  accounts,
  categories,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(true);

  // 預設帳戶：先信用卡 → 任意帳戶
  const defaultAccountId = useMemo(() => {
    const cc = accounts.find((a) => a.type === "credit_card");
    return cc?.id ?? accounts[0]?.id ?? "";
  }, [accounts]);
  const [accountId, setAccountId] = useState(defaultAccountId);

  // per-row 編輯狀態：勾選 + 分類覆寫
  const [editedRows, setEditedRows] = useState(() =>
    preview.rows.map((r) => ({
      ...r,
      include: r.status === "new", // duplicate / refund 預設不勾
      category: r.suggestedCategory,
    }))
  );

  const includedCount = editedRows.filter((r) => r.include).length;

  // 動態分類選項：優先用使用者自訂 categories.code，沒給走靜態 7 大類
  const categoryOptions = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories
        .filter(
          (c): c is CategoryRow & { code: string } =>
            c.type === "expense" && !!c.code
        )
        .map((c) => ({ code: c.code as ExpenseCategory, label: c.name }));
    }
    return (
      Object.entries(EXPENSE_CATEGORY_LABEL) as Array<[ExpenseCategory, string]>
    ).map(([code, label]) => ({ code, label }));
  }, [categories]);

  const categoryLabelMap = useMemo(
    () => new Map(categoryOptions.map((c) => [c.code, c.label])),
    [categoryOptions]
  );

  function toggleRow(idx: number) {
    setEditedRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, include: !r.include } : r))
    );
  }

  function changeCategory(idx: number, category: ExpenseCategory) {
    setEditedRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, category } : r))
    );
  }

  function handleConfirm() {
    if (!accountId) {
      toast.error("請先選擇匯入目標帳戶");
      return;
    }
    const selected = editedRows.filter((r) => r.include);
    if (selected.length === 0) {
      toast.warning("沒有勾選任何要匯入的交易");
      return;
    }
    startTransition(async () => {
      const result = await confirmImport(
        selected.map((r) => ({
          date: r.date,
          description: r.description,
          amount: r.amount,
          category: r.category,
        })),
        accountId
      );
      if (!result.ok) {
        toast.error("匯入失敗", { description: result.error });
        return;
      }
      toast.success(`已匯入 ${result.inserted} 筆交易`, {
        description: "重整後可在明細頁查看",
      });
      setOpen(false);
      onClose();
      router.refresh();
    });
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-emerald-400" />
            匯入預覽 — {preview.format.toUpperCase()} 信用卡明細
          </DialogTitle>
          <DialogDescription>
            共 {editedRows.length} 筆 · 新交易 {preview.stats.new} 筆 · 重複{" "}
            {preview.stats.duplicate} 筆 · 退款 {preview.stats.refund} 筆 ·
            目前勾選 <strong className="text-emerald-400">{includedCount}</strong> 筆
          </DialogDescription>
        </DialogHeader>

        {/* 帳戶選擇 */}
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            匯入到哪個帳戶
          </label>
          <Select
            value={accountId}
            onValueChange={(v) => setAccountId(v as string)}
          >
            <SelectTrigger className="w-full">
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
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {getAccountLabel(a.id, a.name)}
                  {a.type === "credit_card" && (
                    <span className="ml-2 text-[10px] text-emerald-400">
                      ＊推薦
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 表格 — 最大高度 60vh，scroll y */}
        <div className="-mx-1 max-h-[60vh] overflow-y-auto rounded-lg ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-foreground/10">
                <th className="px-2 py-2 text-left font-medium">勾選</th>
                <th className="px-2 py-2 text-left font-medium">日期</th>
                <th className="px-2 py-2 text-left font-medium">摘要</th>
                <th className="px-2 py-2 text-right font-medium">金額</th>
                <th className="px-2 py-2 text-left font-medium">分類</th>
                <th className="px-2 py-2 text-left font-medium">狀態</th>
              </tr>
            </thead>
            <tbody>
              {editedRows.map((r, idx) => (
                <tr
                  key={idx}
                  className={cn(
                    "border-b border-foreground/[0.04] transition-colors",
                    !r.include && "opacity-50",
                    r.status === "duplicate" && "bg-rose-500/[0.02]",
                    r.status === "refund" && "bg-amber-500/[0.02]"
                  )}
                >
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={() => toggleRow(idx)}
                      disabled={pending || r.status === "refund"}
                      className="size-4 cursor-pointer accent-emerald-500"
                      aria-label={`勾選 ${r.description}`}
                    />
                  </td>
                  <td className="px-2 py-2 tabular-nums text-xs text-muted-foreground">
                    {r.date.slice(5)}
                  </td>
                  <td className="px-2 py-2">
                    <p className="max-w-[16rem] truncate">{r.description}</p>
                  </td>
                  <td className="px-2 py-2 text-right text-sm font-medium tabular-nums">
                    <Money value={r.amount} />
                  </td>
                  <td className="px-2 py-2">
                    <Select
                      value={r.category}
                      onValueChange={(v) =>
                        changeCategory(idx, v as ExpenseCategory)
                      }
                    >
                      <SelectTrigger className="h-8 min-w-[7rem] text-xs">
                        <SelectValue>
                          {(v) =>
                            typeof v === "string"
                              ? categoryLabelMap.get(v as ExpenseCategory) ?? v
                              : "選分類"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((opt) => (
                          <SelectItem key={opt.code} value={opt.code}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <StatusChip status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={pending || includedCount === 0 || !accountId}
            className="bg-emerald-600 text-white hover:bg-emerald-600/90"
          >
            {pending ? (
              <>
                <Loader2Icon className="size-3.5 animate-spin" />
                匯入中
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5" />
                確認匯入 {includedCount} 筆新交易
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────── 狀態 chip ─────────────────── */

function StatusChip({ status }: { status: "new" | "duplicate" | "refund" }) {
  if (status === "duplicate") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300 ring-1 ring-rose-500/30">
        <ShieldAlert className="size-2.5" />
        重複 (不匯入)
      </span>
    );
  }
  if (status === "refund") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/30">
        ⇩ 退款 (跳過)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
      <CheckCircle2 className="size-2.5" />
      新交易
    </span>
  );
}
