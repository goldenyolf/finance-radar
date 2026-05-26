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
import { DEFAULT_SETTINGS, type ResolvedSettings } from "@/lib/system-settings";

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

/**
 * Phase 5 之後 system_settings 只剩全域安全門檻；per-category 預算改由
 * CategoriesCard 內每張卡片自帶的預算欄位編輯。
 */
export function SystemSettingsForm({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [safetyDraft, setSafetyDraft] = useState(
    toNumberInput(initial.safetyThreshold)
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveSystemSettings({
        safetyThreshold: toNumber(safetyDraft),
      });
      if (!result.ok) {
        toast.error("儲存失敗", { description: result.error });
        return;
      }
      toast.success("設定已更新", {
        description: "首頁安全門檻會同步刷新",
      });
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">🛟 全局現金安全門檻</CardTitle>
          <CardDescription>
            現金預測跌破此值會觸發首頁紅色預警橫幅，並在現金流圖表上畫紅色虛線。
            預設 {DEFAULT_SETTINGS.safetyThreshold.toLocaleString("zh-TW")}。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
          <div className="flex justify-end">
            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className="rounded-full"
            >
              {pending ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  儲存中
                </>
              ) : (
                "儲存"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
