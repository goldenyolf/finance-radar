"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import confetti from "canvas-confetti";
import { Loader2Icon, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AnimatedNumber } from "@/components/dashboard/animated-number";
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
import { Progress } from "@/components/ui/progress";
import {
  addFundsToGoal,
  createGoal,
  deleteGoal,
} from "@/lib/actions/goals";
import {
  daysUntilDeadline,
  goalPercent,
  type GoalRow,
} from "@/lib/goals";

interface Props {
  goals: GoalRow[];
}

interface CreateDraft {
  name: string;
  targetAmount: string;
  deadline: string;
  imageUrl: string;
}

const BLANK_CREATE: CreateDraft = {
  name: "",
  targetAmount: "",
  deadline: "",
  imageUrl: "",
};

const CONFETTI_COLORS = [
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#6366f1", // indigo
  "#06b6d4", // cyan
  "#f97316", // orange
];

/** 噴 3-5 秒的彩帶，模擬「兩側交替噴發」的派對效果。*/
function fireConfetti() {
  const duration = 4000;
  const animationEnd = Date.now() + duration;
  const baseConfig = {
    startVelocity: 32,
    spread: 360,
    ticks: 60,
    zIndex: 9999,
    colors: CONFETTI_COLORS,
  };

  const interval = window.setInterval(() => {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) {
      window.clearInterval(interval);
      return;
    }
    // 粒子數隨時間衰減，營造逐漸熄滅的派對感
    const particleCount = Math.floor(50 * (timeLeft / duration));
    confetti({
      ...baseConfig,
      particleCount,
      origin: { x: Math.random() * 0.3 + 0.05, y: Math.random() * 0.4 + 0.1 },
    });
    confetti({
      ...baseConfig,
      particleCount,
      origin: { x: Math.random() * 0.3 + 0.65, y: Math.random() * 0.4 + 0.1 },
    });
  }, 250);
}

export function GoalTrackerCard({ goals }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(BLANK_CREATE);
  const [pending, startTransition] = useTransition();

  const [depositGoalId, setDepositGoalId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeDepositGoal = goals.find((g) => g.id === depositGoalId) ?? null;

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createGoal({
        name: createDraft.name,
        targetAmount: Number.parseFloat(createDraft.targetAmount),
        deadline: createDraft.deadline || null,
        imageUrl: createDraft.imageUrl || null,
      });
      if (!result.ok) {
        toast.error("建立失敗", { description: result.error });
        return;
      }
      toast.success("新夢想已啟程", { description: createDraft.name });
      setCreateOpen(false);
      setCreateDraft(BLANK_CREATE);
      router.refresh();
    });
  }

  function handleDeposit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeDepositGoal) return;
    const amount = Number.parseFloat(depositAmount);
    startTransition(async () => {
      const result = await addFundsToGoal(activeDepositGoal.id, amount);
      if (!result.ok) {
        toast.error("提撥失敗", { description: result.error });
        return;
      }

      // 100% 達標 → 噴彩帶 + 大字 toast
      if (result.justCompleted) {
        fireConfetti();
        toast.success("🎉 目標達成！", {
          description: `恭喜！【${activeDepositGoal.name}】目標已達成！準備好出發了嗎？`,
          duration: 6000,
        });
      } else {
        toast.success("提撥成功", {
          description: `為【${activeDepositGoal.name}】注入 $${amount.toLocaleString("zh-TW")} 能量！`,
        });
      }

      setDepositGoalId(null);
      setDepositAmount("");
      router.refresh();
    });
  }

  function handleDelete(goal: GoalRow) {
    if (deletingId) return;
    if (!window.confirm(`確定要刪除「${goal.name}」這個夢想？相關提撥紀錄也會一併消失。`)) {
      return;
    }
    setDeletingId(goal.id);
    startTransition(async () => {
      const result = await deleteGoal(goal.id);
      setDeletingId(null);
      if (!result.ok) {
        toast.error("刪除失敗", { description: result.error });
        return;
      }
      toast.success("夢想已刪除", { description: goal.name });
      router.refresh();
    });
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-base">🌟 夢想基金進度</CardTitle>
            </div>
            <CardDescription className="mt-1">
              把抽象的「想要」變成具體的儲蓄目標。LINE 機器人可以輸入「提撥 500 到迪士尼」直接灌注。
            </CardDescription>
          </div>
          <Button
            type="button"
            size="lg"
            className="gap-1.5 rounded-full"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            建立夢想
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {goals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
            還沒設定任何夢想。點右上「建立夢想」開啟你的第一個目標。
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {goals.map((goal) => (
              <GoalRowItem
                key={goal.id}
                goal={goal}
                onDeposit={() => {
                  setDepositGoalId(goal.id);
                  setDepositAmount("");
                }}
                onDelete={() => handleDelete(goal)}
                deleting={deletingId === goal.id}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <CreateGoalDialog
        open={createOpen}
        onOpenChange={(v) => !pending && setCreateOpen(v)}
        draft={createDraft}
        setDraft={setCreateDraft}
        pending={pending}
        onSubmit={handleCreate}
      />

      <DepositDialog
        goal={activeDepositGoal}
        amount={depositAmount}
        setAmount={setDepositAmount}
        onClose={() => !pending && setDepositGoalId(null)}
        pending={pending}
        onSubmit={handleDeposit}
      />
    </Card>
  );
}

/* ─────────────────────────── Row ─────────────────────────── */

interface RowProps {
  goal: GoalRow;
  onDeposit: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function GoalRowItem({ goal, onDeposit, onDelete, deleting }: RowProps) {
  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);
  const pct = goalPercent(goal);
  const clamped = Math.min(100, Math.max(0, pct));
  const completed = pct >= 100;
  const days = daysUntilDeadline(goal.deadline);

  const daysLabel =
    days === null
      ? "未設定截止日"
      : days < 0
        ? `已超過截止日 ${-days} 天`
        : days === 0
          ? "今日截止"
          : `剩餘 ${days} 天`;

  return (
    <li className="group flex flex-col gap-2.5 rounded-xl border border-foreground/5 bg-card/40 p-4 ring-1 ring-foreground/5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {goal.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={goal.image_url}
              alt=""
              className="size-9 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-base">
              🌟
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {goal.name}
              {completed && (
                <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                  ✨ 已達成
                </span>
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{daysLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1 rounded-full text-xs"
            onClick={onDeposit}
          >
            <Plus className="size-3.5" />
            提撥
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`刪除 ${goal.name}`}
            onClick={onDelete}
            disabled={deleting}
            className="opacity-0 transition-opacity text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {deleting ? <Loader2Icon className="animate-spin" /> : <Trash2 />}
          </Button>
        </div>
      </div>

      <Progress
        value={clamped}
        aria-label={`${goal.name} 進度`}
        className="[&_[data-slot=progress-track]]:bg-emerald-500/15 [&_[data-slot=progress-indicator]]:bg-emerald-500"
      />

      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="tabular-nums text-muted-foreground">
          <strong className="text-base font-bold text-foreground">
            <AnimatedNumber value={current} />
          </strong>
          <span className="mx-1">/</span>
          <span>{target.toLocaleString("zh-TW")}</span>
        </span>
        <span
          className={`text-base font-bold tabular-nums ${
            completed
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-foreground"
          }`}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
    </li>
  );
}

/* ─────────────────────────── Create Dialog ─────────────────────────── */

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: CreateDraft;
  setDraft: (next: CreateDraft) => void;
  pending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function CreateGoalDialog({
  open,
  onOpenChange,
  draft,
  setDraft,
  pending,
  onSubmit,
}: CreateDialogProps) {
  const nameId = useId();
  const targetId = useId();
  const deadlineId = useId();
  const imageId = useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>建立新夢想</DialogTitle>
          <DialogDescription>
            把抽象的「想要」變成可量化的目標，每次提撥都會被記下來。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={nameId}>夢想名稱</Label>
            <Input
              id={nameId}
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例：全家日本迪士尼之旅"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={targetId}>目標金額 (TWD)</Label>
              <Input
                id={targetId}
                required
                type="number"
                inputMode="numeric"
                min="0"
                step="1000"
                value={draft.targetAmount}
                onChange={(e) =>
                  setDraft({ ...draft, targetAmount: e.target.value })
                }
                className="tabular-nums"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={deadlineId}>預計達成日（可選）</Label>
              <Input
                id={deadlineId}
                type="date"
                value={draft.deadline}
                onChange={(e) =>
                  setDraft({ ...draft, deadline: e.target.value })
                }
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={imageId}>圖示 URL（可選）</Label>
            <Input
              id={imageId}
              type="url"
              value={draft.imageUrl}
              onChange={(e) =>
                setDraft({ ...draft, imageUrl: e.target.value })
              }
              placeholder="https://..."
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              留空會顯示 🌟 icon
            </p>
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
                  建立中
                </>
              ) : (
                "啟程出發"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── Deposit Dialog ─────────────────────────── */

interface DepositDialogProps {
  goal: GoalRow | null;
  amount: string;
  setAmount: (v: string) => void;
  onClose: () => void;
  pending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function DepositDialog({
  goal,
  amount,
  setAmount,
  onClose,
  pending,
  onSubmit,
}: DepositDialogProps) {
  const amountId = useId();
  const open = !!goal;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {goal && (
          <>
            <DialogHeader>
              <DialogTitle>提撥資金 → {goal.name}</DialogTitle>
              <DialogDescription>
                目前累積{" "}
                <strong className="tabular-nums">
                  {Number(goal.current_amount).toLocaleString("zh-TW")}
                </strong>
                {" / "}
                {Number(goal.target_amount).toLocaleString("zh-TW")}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={amountId}>提撥金額 (TWD)</Label>
                <Input
                  id={amountId}
                  required
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-lg tabular-nums"
                  autoFocus
                />
              </div>

              <DialogFooter className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={pending}
                >
                  取消
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2Icon className="size-3.5 animate-spin" />
                      注入中
                    </>
                  ) : (
                    "確認提撥"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
