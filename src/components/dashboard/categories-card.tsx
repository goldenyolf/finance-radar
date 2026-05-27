"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  Loader2Icon,
  Lock,
  Pencil,
  Plus,
  Tags,
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
  createCategory,
  deleteCategory,
  updateCategory,
  type CreateCategoryInput,
} from "@/lib/actions/categories";
import type { CategoryRow, CategoryType } from "@/lib/categories";

interface Props {
  categories: CategoryRow[];
}

interface DraftState {
  id?: string;
  name: string;
  type: CategoryType;
  color: string;
  keywords: string;
  /** 字串型態方便 UI 區分「未輸入」(空字串) vs 0；submit 時轉 number */
  budgetMonthly: string;
}

const BLANK_DRAFT: DraftState = {
  name: "",
  type: "expense",
  color: "#94A3B8",
  keywords: "",
  budgetMonthly: "",
};

const PRESET_COLORS = [
  "#F59E0B", // amber
  "#F472B6", // pink
  "#B45309", // amber-700 (caramel)
  "#14B8A6", // teal
  "#6366F1", // indigo
  "#0EA5E9", // sky
  "#10B981", // emerald
  "#EF4444", // red
  "#8B5CF6", // violet
  "#94A3B8", // slate
];

export function CategoriesCard({ categories }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(BLANK_DRAFT);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openCreate() {
    setDraft(BLANK_DRAFT);
    setDialogOpen(true);
  }

  function openEdit(row: CategoryRow) {
    setDraft({
      id: row.id,
      name: row.name,
      type: row.type,
      color: row.color,
      keywords: row.keywords,
      budgetMonthly: row.budget_monthly > 0 ? String(row.budget_monthly) : "",
    });
    setDialogOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const budget = draft.budgetMonthly.trim()
      ? Number(draft.budgetMonthly)
      : 0;
    const payload: CreateCategoryInput = {
      name: draft.name,
      type: draft.type,
      color: draft.color,
      keywords: draft.keywords,
      budget_monthly: Number.isFinite(budget) && budget >= 0 ? budget : 0,
    };
    startTransition(async () => {
      const result = draft.id
        ? await updateCategory({ ...payload, id: draft.id })
        : await createCategory(payload);
      if (!result.ok) {
        toast.error(draft.id ? "更新失敗" : "新增失敗", {
          description: result.error,
        });
        return;
      }
      toast.success(draft.id ? "已更新分類" : "已新增分類", {
        description: draft.name,
      });
      setDialogOpen(false);
      router.refresh();
    });
  }

  function handleDelete(row: CategoryRow) {
    if (deletingId) return;
    if (row.code) {
      toast.error("預設分類無法刪除", {
        description: "可以編輯名稱、顏色、關鍵字，但不能整個移除",
      });
      return;
    }
    if (!window.confirm(`確定要刪除「${row.name}」這個分類？`)) return;
    setDeletingId(row.id);
    startTransition(async () => {
      const result = await deleteCategory(row.id);
      setDeletingId(null);
      if (!result.ok) {
        toast.error("刪除失敗", { description: result.error });
        return;
      }
      toast.success("已刪除分類", { description: row.name });
      router.refresh();
    });
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Tags className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">🏷️ 分類管理</CardTitle>
            </div>
            <CardDescription className="mt-1">
              管理你的花費/收入分類；顏色會同步到分析頁的圓餅圖與桑基圖，
              關鍵字會餵給 LINE 機器人 + LLM 自動分類。預設 7 大類可改名換色，
              但保留 code 不能刪除。
            </CardDescription>
          </div>
          <Button
            type="button"
            size="lg"
            className="gap-1.5 rounded-full"
            onClick={openCreate}
          >
            <Plus className="size-4" />
            新增分類
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {categories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
            還沒有任何分類 — 新會員首次登入時應該會自動 seed，若沒看到請聯絡管理員。
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {categories.map((cat) => (
              <CategoryRowItem
                key={cat.id}
                category={cat}
                onEdit={() => openEdit(cat)}
                onDelete={() => handleDelete(cat)}
                deleting={deletingId === cat.id}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={(v) => !pending && setDialogOpen(v)}
        draft={draft}
        setDraft={setDraft}
        pending={pending}
        onSubmit={handleSubmit}
        isEdit={!!draft.id}
      />
    </Card>
  );
}

/* ─────────────── Row ─────────────── */

interface RowProps {
  category: CategoryRow;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function CategoryRowItem({ category, onEdit, onDelete, deleting }: RowProps) {
  const isBuiltIn = !!category.code;
  const keywordPreview = category.keywords
    ? category.keywords.split(/[,，、\s]+/).filter(Boolean).slice(0, 4).join(" · ")
    : "（未設關鍵字）";
  const budgetLabel =
    category.budget_monthly > 0
      ? `預算 NT$${category.budget_monthly.toLocaleString("zh-TW")}/月`
      : null;

  return (
    <li
      /*
        改 grid 為 [color | 主體內容 | actions]，actions 永遠保留 56px 版位（行動版
        永遠顯示，桌面 hover-reveal）。主體內容用 flex-col 直向堆疊「名稱列 / 預算 /
        關鍵字」三段；之前單行擠 name + 預設 badge + type + 預算 → 窄螢幕完全崩潰。
      */
      className="group grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-1 rounded-lg border border-foreground/5 bg-card px-3 py-2.5 hover:bg-muted/40 sm:border-transparent sm:bg-transparent sm:p-2"
    >
      <span
        aria-hidden
        className="mt-1 inline-block size-4 shrink-0 rounded-md ring-1 ring-foreground/10"
        style={{ backgroundColor: category.color }}
      />

      <div className="min-w-0 space-y-1">
        {/* 名稱列：flex-wrap 讓 badge / type chip 在窄螢幕自動換行不擠壓 */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold break-words">
            {category.name}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${
              category.type === "expense"
                ? "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300"
                : "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300"
            }`}
          >
            {category.type === "expense" ? "支出" : "收入"}
          </span>
          {isBuiltIn && (
            <span
              title="預設分類，code 不可改、不可刪"
              className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <Lock className="size-2.5" />
              預設
            </span>
          )}
        </div>

        {budgetLabel && (
          <p
            data-money
            className="text-[11px] tabular-nums text-emerald-700 dark:text-emerald-400"
          >
            {budgetLabel}
          </p>
        )}

        <p className="truncate text-[11px] text-muted-foreground">
          {keywordPreview}
        </p>
      </div>

      {/* Actions：行動版永遠顯示（沒有 hover），sm+ 才走 hover-reveal */}
      <div className="flex items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label={`編輯 ${category.name}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          disabled={deleting || isBuiltIn}
          aria-label={`刪除 ${category.name}`}
          className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-30"
        >
          {deleting ? <Loader2Icon className="animate-spin" /> : <Trash2 />}
        </Button>
      </div>
    </li>
  );
}

/* ─────────────── Dialog ─────────────── */

interface DialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: DraftState;
  setDraft: (next: DraftState) => void;
  pending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isEdit: boolean;
}

function CategoryDialog({
  open,
  onOpenChange,
  draft,
  setDraft,
  pending,
  onSubmit,
  isEdit,
}: DialogProps) {
  const nameId = useId();
  const typeId = useId();
  const colorId = useId();
  const keywordsId = useId();
  const budgetId = useId();
  const isExpense = draft.type === "expense";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "編輯分類" : "新增分類"}</DialogTitle>
          <DialogDescription>
            關鍵字以逗號或空白分隔；LINE 機器人會用這些字判斷該筆訊息屬於哪個分類。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={nameId}>分類名稱</Label>
            <Input
              id={nameId}
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例：寵物用品"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={typeId}>類型</Label>
              <Select
                value={draft.type}
                onValueChange={(v) =>
                  setDraft({ ...draft, type: v as CategoryType })
                }
              >
                <SelectTrigger id={typeId} className="w-full">
                  <SelectValue>
                    {(v) => (v === "income" ? "收入" : "支出")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">支出</SelectItem>
                  <SelectItem value="income">收入</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={colorId}>顏色</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id={colorId}
                  value={draft.color}
                  onChange={(e) =>
                    setDraft({ ...draft, color: e.target.value.toUpperCase() })
                  }
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent"
                />
                <Input
                  value={draft.color}
                  onChange={(e) =>
                    setDraft({ ...draft, color: e.target.value.toUpperCase() })
                  }
                  placeholder="#94A3B8"
                  className="font-mono text-xs tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`使用顏色 ${c}`}
                onClick={() => setDraft({ ...draft, color: c })}
                className={`size-6 rounded-md ring-1 transition-transform hover:scale-110 ${
                  draft.color.toUpperCase() === c.toUpperCase()
                    ? "ring-2 ring-foreground"
                    : "ring-foreground/20"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={keywordsId}>關鍵字（逗號分隔）</Label>
            <textarea
              id={keywordsId}
              value={draft.keywords}
              onChange={(e) =>
                setDraft({ ...draft, keywords: e.target.value })
              }
              rows={3}
              placeholder="午餐, 便當, 飲料, 超市"
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <p className="text-[11px] text-muted-foreground">
              LINE 機器人會用這些字辨識分類；越多越精準。
            </p>
          </div>

          {isExpense && (
            <div className="grid gap-1.5">
              <Label htmlFor={budgetId}>每月預算上限（TWD）</Label>
              <Input
                id={budgetId}
                type="number"
                inputMode="numeric"
                min="0"
                step="500"
                value={draft.budgetMonthly}
                onChange={(e) =>
                  setDraft({ ...draft, budgetMonthly: e.target.value })
                }
                placeholder="留空或 0 = 不設預算"
                className="tabular-nums"
              />
              <p className="text-[11px] text-muted-foreground">
                有設預算時，圓餅圖會出現進度條（綠/橘/紅），LINE 記到此分類超過
                80% 會提示、超過 100% 會警告。
              </p>
            </div>
          )}

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
                "新增分類"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
