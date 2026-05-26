"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Check, Link2, Loader2Icon, Unlink } from "lucide-react";
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
  bindLineUserId,
  unbindLineUserId,
} from "@/lib/actions/profile";

interface Props {
  currentLineUserId: string | null;
}

export function LineBindingCard({ currentLineUserId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const inputId = useId();

  const isBound = !!currentLineUserId;

  function handleBind(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    startTransition(async () => {
      const result = await bindLineUserId(value);
      if (!result.ok) {
        toast.error("綁定失敗", { description: result.error });
        return;
      }
      toast.success("已綁定 LINE 帳號", {
        description: "之後 LINE 發訊息即可記到你的帳目下",
      });
      setDraft("");
      router.refresh();
    });
  }

  function handleUnbind() {
    if (!window.confirm("確定要解除 LINE 綁定？解綁後 LINE 機器人會拒絕記帳。")) return;
    startTransition(async () => {
      const result = await unbindLineUserId();
      if (!result.ok) {
        toast.error("解綁失敗", { description: result.error });
        return;
      }
      toast.success("已解除 LINE 綁定");
      router.refresh();
    });
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">📲 LINE 記帳綁定</CardTitle>
        </div>
        <CardDescription className="mt-1">
          綁定後從你的 LINE 帳號發訊息會自動記到 Money Radar 的這個會員身上。
          沒綁的話 LINE 機器人會拒絕記帳並提示來這設定。
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isBound ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/[0.08] px-4 py-3 ring-1 ring-emerald-500/30">
              <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  已綁定
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {currentLineUserId}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUnbind}
                disabled={pending}
                className="gap-1.5"
              >
                <Unlink className="size-3.5" />
                解綁
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleBind} className="flex flex-col gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={inputId}>LINE User ID</Label>
              <Input
                id={inputId}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="U1234567890abcdef..."
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                取得方式：LINE Developer Console → Messaging API → 拉到頁面底部找
                「Your user ID」（U 開頭 + 32 字 hex）。
              </p>
            </div>
            <Button
              type="submit"
              disabled={pending}
              className="gap-1.5 self-end rounded-full"
            >
              {pending ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  綁定中
                </>
              ) : (
                <>
                  <Link2 className="size-4" />
                  確認綁定
                </>
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
