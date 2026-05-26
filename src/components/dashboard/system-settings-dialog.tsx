"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, Settings } from "lucide-react";
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
import { saveSystemSettings } from "@/lib/actions/system-settings";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/expense-categories";
import { supabase } from "@/lib/supabase";
import {
  BUDGET_CATEGORIES,
  DEFAULT_SETTINGS,
  parseSettings,
  type BudgetCategory,
  type SystemSettingRow,
} from "@/lib/system-settings";

type BudgetDraft = Partial<Record<BudgetCategory, string>>;

function toNumberInput(n: number | undefined): string {
  return n === undefined || n === 0 ? "" : String(n);
}

function toNumber(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function SystemSettingsDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const [safetyDraft, setSafetyDraft] = useState("");
  const [budgetsDraft, setBudgetsDraft] = useState<BudgetDraft>({});

  // 每次開 dialog 都重新撈一次最新設定（避免上次未儲存的草稿留下）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value");
      if (cancelled) return;
      if (error) {
        toast.error("讀取設定失敗", { description: error.message });
        setLoading(false);
        return;
      }
      const parsed = parseSettings((data ?? []) as SystemSettingRow[]);
      setSafetyDraft(toNumberInput(parsed.safetyThreshold ?? undefined));
      const draft: BudgetDraft = {};
      for (const cat of BUDGET_CATEGORIES) {
        draft[cat] = toNumberInput(parsed.budgets[cat]);
      }
      setBudgetsDraft(draft);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const budgets: Partial<Record<BudgetCategory, number>> = {};
    for (const cat of BUDGET_CATEGORIES) {
      const n = toNumber(budgetsDraft[cat]);
      if (n > 0) budgets[cat] = n;
    }

    startTransition(async () => {
      const result = await saveSystemSettings({
        safetyThreshold: toNumber(safetyDraft),
        budgets,
      });
      if (!result.ok) {
        toast.error("儲存失敗", { description: result.error });
        return;
      }
      toast.success("設定已更新", {
        description: "首頁的安全門檻與預算進度條會同步刷新",
      });
      setOpen(false);
      router.refresh();
    });
  }

  const safetyId = useId();

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="gap-1.5 rounded-full"
            aria-label="系統設定"
          />
        }
      >
        <Settings className="size-4" />
        系統設定
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>⚙️ 系統設定</DialogTitle>
          <DialogDescription>
            預算上限會跟首頁圓餅圖進度條 + LINE 記帳警報連動。輸入 0 或留空
            表示「不設預算」。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* 全域現金安全門檻 */}
          <div className="grid gap-1.5">
            <Label htmlFor={safetyId}>全局現金安全門檻 (TWD)</Label>
            <Input
              id={safetyId}
              type="number"
              inputMode="numeric"
              min="0"
              step="1000"
              value={safetyDraft}
              onChange={(e) => setSafetyDraft(e.target.value)}
              placeholder={String(DEFAULT_SETTINGS.safetyThreshold)}
              className="tabular-nums"
              disabled={loading}
            />
            <p className="text-[11px] text-muted-foreground">
              現金預測跌破此值會觸發頂部紅色預警橫幅
            </p>
          </div>

          <div className="border-t border-foreground/10" />

          <div className="flex items-center justify-between">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              每月分類預算上限
            </p>
            {loading && (
              <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {BUDGET_CATEGORIES.map((cat) => {
              const id = `budget-${cat}`;
              return (
                <div key={cat} className="grid gap-1.5">
                  <Label htmlFor={id} className="text-xs">
                    {EXPENSE_CATEGORY_LABEL[cat]}
                  </Label>
                  <Input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="500"
                    value={budgetsDraft[cat] ?? ""}
                    onChange={(e) =>
                      setBudgetsDraft((prev) => ({
                        ...prev,
                        [cat]: e.target.value,
                      }))
                    }
                    placeholder={String(DEFAULT_SETTINGS.budgets[cat])}
                    className="tabular-nums"
                    disabled={loading}
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending || loading}>
              {pending ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  儲存中
                </>
              ) : (
                "儲存設定"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
