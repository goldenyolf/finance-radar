import Link from "next/link";
import { ArrowRight, Sparkles, Target } from "lucide-react";

import { AnimatedNumber } from "@/components/dashboard/animated-number";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  daysUntilDeadline,
  goalPercent,
  type GoalRow,
} from "@/lib/goals";

interface Props {
  goals: GoalRow[];
}

/**
 * 首頁的「夢想基金微型卡片」：挑一個 featured goal 顯示迷你進度條 +
 * 「查看全部 N 個」連結到 /goals 完整管理頁。
 *
 * Featured 挑選邏輯：「最近 deadline 但還沒達標」最有故事性；
 * 全達標或無 deadline 時 fallback 第一筆。
 */
export function GoalSummaryLink({ goals }: Props) {
  // Empty state — 引導建立第一個夢想
  if (goals.length === 0) {
    return (
      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-500" />
            <CardTitle className="text-base">🌟 夢想基金</CardTitle>
          </div>
          <CardDescription className="mt-1">
            把抽象的「想要」變成可量化目標，達標時系統會給你來場彩帶派對。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/goals"
            className="flex items-center justify-between rounded-lg border border-dashed border-foreground/15 bg-muted/30 px-4 py-3 text-sm transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5"
          >
            <span className="text-muted-foreground">
              還沒設定任何夢想，點此建立第一個
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  // 挑 featured：先選未達標 + 最近 deadline；全達標 fallback 第一筆
  const featured = pickFeaturedGoal(goals);
  const target = Number(featured.target_amount);
  const current = Number(featured.current_amount);
  const pct = goalPercent(featured);
  const clamped = Math.min(100, Math.max(0, pct));
  const completed = pct >= 100;
  const days = daysUntilDeadline(featured.deadline);

  const daysLabel =
    days === null
      ? null
      : days < 0
        ? `已超過 ${-days} 天`
        : days === 0
          ? "今日截止"
          : `剩 ${days} 天`;

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            <CardTitle className="text-base">🌟 夢想基金</CardTitle>
          </div>
          <Link
            href="/goals"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            查看全部 {goals.length} 個
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <CardDescription className="mt-1">
          {completed
            ? `🎉 已達成！點右上連結回顧 / 提撥下個夢想`
            : `目前主推：${featured.name}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href="/goals"
          aria-label={`查看夢想 ${featured.name}`}
          className="flex flex-col gap-2 rounded-lg p-1 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold">
              {featured.name}
            </span>
            <span
              className={`shrink-0 text-sm font-bold tabular-nums ${
                completed
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground"
              }`}
            >
              {pct.toFixed(0)}%
            </span>
          </div>

          <Progress
            value={clamped}
            aria-label={`${featured.name} 進度`}
            className="[&_[data-slot=progress-track]]:bg-emerald-500/15 [&_[data-slot=progress-indicator]]:bg-emerald-500"
          />

          <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              <strong className="font-semibold text-foreground">
                <AnimatedNumber value={current} />
              </strong>
              <span className="mx-1">/</span>
              <span>{target.toLocaleString("zh-TW")}</span>
            </span>
            {daysLabel && <span>{daysLabel}</span>}
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}

function pickFeaturedGoal(goals: GoalRow[]): GoalRow {
  const undone = goals.filter(
    (g) => Number(g.current_amount) < Number(g.target_amount)
  );
  const pool = undone.length > 0 ? undone : goals;

  // 排序：有 deadline 的最近的優先，沒 deadline 排後面
  return [...pool].sort((a, b) => {
    const aDays = daysUntilDeadline(a.deadline);
    const bDays = daysUntilDeadline(b.deadline);
    if (aDays === null && bDays === null) return 0;
    if (aDays === null) return 1;
    if (bDays === null) return -1;
    return aDays - bDays;
  })[0];
}
