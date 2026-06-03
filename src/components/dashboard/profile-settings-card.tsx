"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2Icon, UserCircle2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProfile } from "@/lib/actions/profile";
import type { AccountRow } from "@/lib/dashboard";
import type { ProfileSettings } from "@/lib/load-profile";

/** Select 不收 null — 用哨兵字串代表「不指定」，submit 時轉回 null。 */
const ACCOUNT_NONE = "__none__";

interface Props {
  initial: ProfileSettings;
  accounts: AccountRow[];
}

/**
 * 👤 個人設定卡 — 暱稱 + 每月儲蓄率目標。
 *
 * 連動：
 *   - 暱稱 → 首頁歡迎詞「歡迎回來，[暱稱]！」（null 走「歡迎回來！」）
 *   - 儲蓄率目標 → /analytics 跨月趨勢圖 ReferenceLine 灰色虛線基準
 *
 * 表單刻意用「dirty 狀態 disable 按鈕」UX —  沒改東西按鈕亮著但點下去
 * 是 no-op 浪費 round trip。看到 dirty 才 enable。
 */
export function ProfileSettingsCard({ initial, accounts }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  const [targetSavingsRate, setTargetSavingsRate] = useState(
    String(initial.target_savings_rate)
  );
  const [defaultAccountId, setDefaultAccountId] = useState<string>(
    initial.default_account_id ?? ACCOUNT_NONE
  );
  const [pending, startTransition] = useTransition();

  // 任何 keystroke 都要立刻翻 dirty → 不能用 .trim()/parseFloat 等正規化（會吞掉
  // 「Austin → Austin 」一個空白的差，按鈕沒亮使用者會覺得壞掉）。直接 raw 字串比對。
  const dirty =
    displayName !== (initial.display_name ?? "") ||
    targetSavingsRate !== String(initial.target_savings_rate) ||
    defaultAccountId !== (initial.default_account_id ?? ACCOUNT_NONE);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rate = Number.parseFloat(targetSavingsRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      toast.error("儲蓄率目標必須在 0–100% 之間");
      return;
    }
    if (displayName.trim().length > 50) {
      toast.error("暱稱請控制在 50 字以內");
      return;
    }

    startTransition(async () => {
      const result = await updateProfile({
        display_name: displayName,
        target_savings_rate: rate,
        default_account_id:
          defaultAccountId === ACCOUNT_NONE ? null : defaultAccountId,
      });
      if (!result.ok) {
        toast.error("儲存失敗", { description: result.error });
        return;
      }
      toast.success("已更新個人設定", {
        description: displayName.trim()
          ? `歡迎你，${displayName.trim()} 👋`
          : "歡迎回來",
      });
      router.refresh();
    });
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserCircle2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">👤 個人設定</CardTitle>
        </div>
        <CardDescription>
          暱稱會顯示在首頁歡迎詞；儲蓄率目標會畫在分析頁的跨月趨勢圖上。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 sm:max-w-md"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="profile-display-name">暱稱（可選）</Label>
            {/* data-private wrapper：input 整顆套 blur(4px)，包含輸入中的字也會跟著糊 */}
            <div data-private>
              <Input
                id="profile-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例：Austin"
                maxLength={50}
                autoComplete="nickname"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              留空 → 首頁顯示「歡迎回來！」；有填 → 顯示「歡迎回來，
              <span data-private>{displayName.trim() || "[暱稱]"}</span>
              ！」
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="profile-savings-rate">每月儲蓄率目標</Label>
            <div className="relative">
              <Input
                id="profile-savings-rate"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.1"
                value={targetSavingsRate}
                onChange={(e) => setTargetSavingsRate(e.target.value)}
                placeholder="20"
                className="pr-8 tabular-nums"
                required
              />
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm font-medium text-muted-foreground"
              >
                %
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              建議 20% 以上是穩健理財的基準；跨月趨勢圖會用這值畫一條灰色目標虛線。
            </p>
          </div>

          {/*
            LINE bot 主要帳戶 — fallback chain (C)。當使用者打「午餐 120」沒
            指定帳戶、分類也沒綁定帳戶時，預設記到這裡。沒設 → 退到
            最早建立的帳戶（避免 new user 還沒選就崩潰）。
          */}
          <div className="grid gap-1.5">
            <Label htmlFor="profile-default-account">
              LINE 記帳的主要帳戶
            </Label>
            <Select
              value={defaultAccountId}
              onValueChange={(v) => setDefaultAccountId(v ?? ACCOUNT_NONE)}
            >
              <SelectTrigger
                id="profile-default-account"
                className="w-full"
              >
                {/*
                  data-private 包整顆 Trigger 的文字區 — 防窺時不論選哪個帳戶
                  都會被 4px 模糊；展開下拉選項時的 SelectContent 在 Portal
                  外層所以這條包不到，下方 SelectItem 各自加 data-private。
                */}
                <SelectValue>
                  {(v) => {
                    if (v === ACCOUNT_NONE || !v) {
                      return "不指定（自動選最早的帳戶）";
                    }
                    const acc = accounts.find((a) => a.id === v);
                    return (
                      <span data-private>{acc?.name ?? String(v)}</span>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ACCOUNT_NONE}>
                  不指定（自動選最早的帳戶）
                </SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    <span data-private>{acc.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              LINE 訊息沒指定帳戶、分類也沒綁定時，預設記到這裡。
            </p>
          </div>

          <div className="mt-2">
            {/*
              按鈕文字鎖死「💾 儲存個人設定」，不再因為 dirty 切「尚未變更」。
              disabled 純粹靠 disabled prop（半透明 + cursor-not-allowed），
              UI 一致；dirty 時走翡翠綠主色（bg-emerald-600）強化「可以按了」訊號。
            */}
            <Button
              type="submit"
              disabled={pending || !dirty}
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600/90 disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  儲存中
                </>
              ) : (
                "💾 儲存個人設定"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
