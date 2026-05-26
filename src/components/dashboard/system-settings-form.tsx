"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSystemSettings } from "@/lib/actions/system-settings";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/expense-categories";
import {
  BUDGET_CATEGORIES,
  DEFAULT_SETTINGS,
  type BudgetCategory,
  type ResolvedSettings,
} from "@/lib/system-settings";

type BudgetDraft = Partial<Record<BudgetCategory, string>>;

function toNumberInput(n: number | undefined | null): string {
  return n === undefined || n === null || n === 0 ? "" : String(n);
}

function toNumber(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

interface Props {
  initial: ResolvedSettings;
}

export function SystemSettingsForm({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [safetyDraft, setSafetyDraft] = useState(
    toNumberInput(initial.safetyThreshold)
  );
  const [budgetsDraft, setBudgetsDraft] = useState<BudgetDraft>(() => {
    const draft: BudgetDraft = {};
    for (const cat of BUDGET_CATEGORIES) {
      draft[cat] = toNumberInput(initial.budgets[cat]);
    }
    return draft;
  });

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
        description: "首頁安全門檻、分析頁進度條與 LINE 警報會同步刷新",
      });
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">🛟 全局現金安全門檻</CardTitle>
          <CardDescription>
            現金預測跌破此值會觸發首頁紅色預警橫幅，並在現金流圖表上畫紅色虛線。
            預設 {DEFAULT_SETTINGS.safetyThreshold.toLocaleString("zh-TW")}。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-1.5">
            <Label htmlFor="safety-threshold">門檻金額 (TWD)</Label>
            <Input
              id="safety-threshold"
              type="number"
              inputMode="numeric"
              min="0"
              step="1000"
              value={safetyDraft}
              onChange={(e) => setSafetyDraft(e.target.value)}
              placeholder={String(DEFAULT_SETTINGS.safetyThreshold)}
              className="max-w-xs tabular-nums"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">📊 每月分類預算上限</CardTitle>
          <CardDescription>
            設好預算後，分析頁圓餅圖該分類會出現進度條（綠/橘/紅），且 LINE
            機器人記到該分類超過 80% 會主動提示、超過 100% 會發警告。輸入 0
            或留空表示「不設預算」。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BUDGET_CATEGORIES.map((cat) => {
              const id = `budget-${cat}`;
              return (
                <div key={cat} className="grid gap-1.5">
                  <Label htmlFor={id} className="text-sm">
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
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} className="rounded-full">
          {pending ? (
            <>
              <Loader2Icon className="size-4 animate-spin" />
              儲存中
            </>
          ) : (
            "儲存設定"
          )}
        </Button>
      </div>
    </form>
  );
}
