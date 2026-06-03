"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Camera,
  Loader2Icon,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { Button } from "@/components/ui/button";
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
  createWealthAccount,
  upsertWealthSnapshot,
} from "@/lib/actions/wealth";
import {
  computeSnapshotTotals,
  formatTwd,
  type WealthAccountRow,
  type WealthAccountType,
  type WealthSnapshotRow,
} from "@/lib/wealth";

interface Props {
  accounts: WealthAccountRow[];
  latest: WealthSnapshotRow | null;
}

function todayIsoTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * 「📸 更新本月資產快照」主 Dialog。
 *
 * 預設行為：
 *   - recorded_at 預填今天（Taipei）；要補登過往日期也可以改
 *   - 每個 account 的初始值取最新一筆快照的 details；新建帳戶顯示空字串
 *   - bottom 即時預覽 totals（純前端 derive，跟 server action 用同一支
 *     computeSnapshotTotals → 前後台一致）
 *   - 沒任何帳戶時整個 dialog 變成「先建第一個帳戶」流程；建好後 list 自動長出來
 *
 * 跟 EditRecurringDialog 同款的 controlled-open 模式 — base-ui 1.5 的
 * <DialogTrigger render={<Button />}> 會 silent 失敗，所以直接 setOpen。
 */
export function UpdateSnapshotDialog({ accounts, latest }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [savePending, startSaveTransition] = useTransition();
  const [createPending, startCreateTransition] = useTransition();

  const [recordedAt, setRecordedAt] = useState(todayIsoTaipei);

  /** 把最新快照的 values 攤平成 id→string map（給 input value 用，空字串才能讓 placeholder 顯示） */
  const initialValues = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (latest) {
      for (const item of latest.details) {
        if (item.value > 0) map[item.account_id] = String(item.value);
      }
    }
    return map;
  }, [latest]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);

  // 新增帳戶 mini-form
  const [showAddForm, setShowAddForm] = useState(accounts.length === 0);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] =
    useState<WealthAccountType>("asset");

  function handleOpenChange(next: boolean) {
    if (savePending) return;
    setOpen(next);
    if (next) {
      // 每次開都重置成「latest 預填」
      setValues(initialValues);
      setRecordedAt(todayIsoTaipei());
      setShowAddForm(accounts.length === 0);
      setNewAccountName("");
      setNewAccountType("asset");
    }
  }

  function handleValueChange(accountId: string, next: string) {
    // 只允許數字 / 小數點；空字串 = 該帳戶值 0
    if (next === "" || /^\d*\.?\d*$/.test(next)) {
      setValues((prev) => ({ ...prev, [accountId]: next }));
    }
  }

  function handleAddAccount() {
    const name = newAccountName.trim();
    if (!name) {
      toast.error("請輸入帳戶名稱");
      return;
    }
    startCreateTransition(async () => {
      const result = await createWealthAccount({
        name,
        type: newAccountType,
      });
      if (!result.ok) {
        toast.error("新增帳戶失敗", { description: result.error });
        return;
      }
      toast.success("已新增財富帳戶", { description: name });
      setNewAccountName("");
      // accounts 由 RSC 重撈；router.refresh 後 props 才會更新
      router.refresh();
      // 避免重複連按 — RSC 還在飛時先關 add form
      setShowAddForm(false);
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accounts.length === 0) {
      toast.error("請先建立至少一個財富帳戶");
      return;
    }

    // 把 string 攤回 number；空字串 → 0（也合理表示「這次該帳戶是 0」）
    const numericValues: Record<string, number> = {};
    for (const acc of accounts) {
      const raw = values[acc.id]?.trim();
      const n = raw ? Number.parseFloat(raw) : 0;
      numericValues[acc.id] = Number.isFinite(n) && n >= 0 ? n : 0;
    }

    startSaveTransition(async () => {
      const result = await upsertWealthSnapshot({
        recordedAt,
        values: numericValues,
      });
      if (!result.ok) {
        toast.error("快照儲存失敗", { description: result.error });
        return;
      }
      const totals = computeSnapshotTotals(accounts, numericValues);
      toast.success("已更新資產快照", {
        description: `淨資產 ${formatTwd(totals.net_worth)}`,
      });
      setOpen(false);
      router.refresh();
    });
  }

  // Live preview totals — 跟 server 用同一支函式
  const previewTotals = useMemo(() => {
    const numericValues: Record<string, number> = {};
    for (const acc of accounts) {
      const raw = values[acc.id]?.trim();
      const n = raw ? Number.parseFloat(raw) : 0;
      numericValues[acc.id] = Number.isFinite(n) && n >= 0 ? n : 0;
    }
    return computeSnapshotTotals(accounts, numericValues);
  }, [accounts, values]);

  const assetAccounts = accounts.filter((a) => a.type === "asset");
  const liabAccounts = accounts.filter((a) => a.type === "liability");
  const noAccounts = accounts.length === 0;

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="gap-1.5 rounded-full bg-foreground px-4 text-background shadow-sm shadow-foreground/10 hover:bg-foreground/90"
        onClick={() => handleOpenChange(true)}
      >
        <Camera className="size-4" />
        <span className="hidden sm:inline">更新本月資產快照</span>
        <span className="sm:hidden">更新快照</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>📸 更新資產快照</DialogTitle>
            <DialogDescription>
              填入每個帳戶「現在的市值」，系統會記錄成一筆月度快照並更新趨勢圖。
              同一天重複儲存會覆蓋當天那筆。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="snapshot-date">快照日期</Label>
              <Input
                id="snapshot-date"
                type="date"
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
                className="tabular-nums"
                required
              />
            </div>

            {/* 新增帳戶 mini-form：沒帳戶時自動展開；有帳戶時 toggle 顯示 */}
            <div className="rounded-lg border border-foreground/10 bg-muted/30 p-3">
              {showAddForm ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium tracking-wider uppercase">
                      新增財富帳戶
                    </Label>
                    {!noAccounts && (
                      <button
                        type="button"
                        onClick={() => setShowAddForm(false)}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                        disabled={createPending}
                      >
                        收起
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <Input
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      placeholder="例：台股部位、房貸"
                      autoComplete="off"
                      disabled={createPending}
                    />
                    <Select
                      value={newAccountType}
                      onValueChange={(v) =>
                        setNewAccountType(v as WealthAccountType)
                      }
                    >
                      <SelectTrigger className="w-full sm:w-32">
                        <SelectValue>
                          {(v) =>
                            v === "liability" ? "負債" : "資產"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asset">資產</SelectItem>
                        <SelectItem value="liability">負債</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddAccount}
                      disabled={createPending}
                      className="gap-1"
                    >
                      {createPending ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <Plus className="size-3.5" />
                      )}
                      新增
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                  新增財富帳戶
                </button>
              )}
            </div>

            {noAccounts ? (
              <p className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
                還沒任何帳戶 — 先用上面的表單建立第一個資產或負債帳戶。
              </p>
            ) : (
              <>
                {/* 資產區 */}
                {assetAccounts.length > 0 && (
                  <AccountSection
                    title="資產"
                    icon={
                      <TrendingUp className="size-4 text-emerald-400" />
                    }
                    accounts={assetAccounts}
                    values={values}
                    onChange={handleValueChange}
                  />
                )}
                {/* 負債區 */}
                {liabAccounts.length > 0 && (
                  <AccountSection
                    title="負債"
                    icon={
                      <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />
                    }
                    accounts={liabAccounts}
                    values={values}
                    onChange={handleValueChange}
                  />
                )}

                {/* Live preview */}
                <div className="rounded-lg bg-foreground/[0.04] px-4 py-3 ring-1 ring-foreground/10">
                  <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                    本次儲存預覽
                  </p>
                  <dl className="mt-2 flex flex-col gap-1 text-sm tabular-nums">
                    <PreviewRow
                      label="總資產"
                      value={previewTotals.total_assets}
                      tone="positive"
                    />
                    <PreviewRow
                      label="總負債"
                      value={previewTotals.total_liabilities}
                      tone="danger"
                    />
                    <PreviewRow
                      label="淨資產"
                      value={previewTotals.net_worth}
                      tone={previewTotals.net_worth >= 0 ? "positive" : "danger"}
                      big
                    />
                  </dl>
                </div>
              </>
            )}

            <DialogFooter className="mt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={savePending}
              >
                取消
              </Button>
              <Button type="submit" disabled={savePending || noAccounts}>
                {savePending ? (
                  <>
                    <Loader2Icon className="size-3.5 animate-spin" />
                    儲存中
                  </>
                ) : (
                  "儲存快照"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────── 帳戶區塊（資產 / 負債） ─────────────── */

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  accounts: WealthAccountRow[];
  values: Record<string, string>;
  onChange: (accountId: string, next: string) => void;
}

function AccountSection({
  title,
  icon,
  accounts,
  values,
  onChange,
}: SectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-xs font-medium tracking-wider uppercase">
          {title}
        </h3>
      </div>
      <div className="flex flex-col gap-2">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="grid grid-cols-[1fr_auto] items-center gap-3"
          >
            <Label
              htmlFor={`snap-${acc.id}`}
              className="truncate text-sm font-medium"
            >
              {acc.name}
            </Label>
            <Input
              id={`snap-${acc.id}`}
              inputMode="decimal"
              placeholder="0"
              value={values[acc.id] ?? ""}
              onChange={(e) => onChange(acc.id, e.target.value)}
              className="w-32 text-right tabular-nums"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Preview row ─────────────── */

interface PreviewRowProps {
  label: string;
  value: number;
  tone: "positive" | "danger";
  big?: boolean;
}

const PREVIEW_TONE: Record<PreviewRowProps["tone"], string> = {
  positive: "text-emerald-400",
  danger: "text-rose-600 dark:text-rose-400",
};

function PreviewRow({ label, value, tone, big }: PreviewRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`${PREVIEW_TONE[tone]} ${
          big ? "text-lg font-bold" : "font-semibold"
        }`}
      >
        <AnimatedNumber value={value} />
      </dd>
    </div>
  );
}
