import { ArrowDown, PiggyBank } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { AboutSection, SectionHeading } from "./section";

/**
 * 示意用的假數字。刻意寫死成常數而不是接 loadDashboard()：
 *   1. /about 是公開頁（proxy 排除清單內），沒有 session 也不該建 Supabase client；
 *   2. 這頁能被靜態預渲染，首屏最快；
 *   3. 最重要 — 介紹頁上永遠不會出現任何一筆真實的財務數字。
 */
const PREVIEW = {
  expense: "$32,480",
  expenseDelta: "較上月 -8.2%",
  income: "$58,000",
  savingsRate: "44.0%",
  budgets: [
    { label: "餐飲食品", used: "$6,240", total: "$8,000", pct: 78 },
    { label: "交通通勤", used: "$1,180", total: "$3,000", pct: 39 },
    { label: "娛樂休閒", used: "$4,700", total: "$4,000", pct: 100, over: true },
  ],
};

/**
 * 儀表板示意 — 這一段是整頁唯一「長得跟登入後一模一樣」的區塊。
 *
 * 卡片樣式（ring-foreground/10、text-[11px] uppercase 標籤、text-2xl
 * tabular-nums 數字）是直接對齊 components/dashboard/month-headline-cards.tsx，
 * 並且吃同一組 globals.css token。所以主題切深色時，這裡就是使用者登入後會看到
 * 的那個 Bloomberg 風畫面 — 不是另外畫一張漂亮但不存在的假圖。
 *
 * 唯一刻意的偏離：數字顏色寫成 rose-600 dark:rose-400（收入同理）。
 * month-headline-cards 只寫 rose-400 是因為儀表板實務上都在深色下看，
 * 但介紹頁的訪客第一次進來吃的是系統主題，很可能是亮色 — 400 色階落在白底上
 * 對比不足。這裡補上 600 的亮色變體，深色下維持與儀表板完全一致。
 */
export function AboutDashboardPreview() {
  return (
    <AboutSection className="border-t border-foreground/5">
      <SectionHeading
        eyebrow="記完帳之後"
        title="打開就看懂，不用自己算"
        description="不用再問「這個月還能花多少」。可動用金額、存下多少、哪一類快超標，一進首頁就攤在眼前。"
      />

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="本月總支出"
          value={PREVIEW.expense}
          valueClassName="text-rose-600 dark:text-rose-400"
          footer={
            <p className="flex items-center gap-1 text-[11px] text-emerald-600 tabular-nums dark:text-emerald-400">
              <ArrowDown className="size-3" strokeWidth={2.5} />
              {PREVIEW.expenseDelta}
            </p>
          }
        />
        <MetricCard
          label="本月總收入"
          value={PREVIEW.income}
          valueClassName="text-emerald-600 dark:text-emerald-400"
          footer={
            <p className="text-[11px] text-muted-foreground/70">
              包含薪資 / 補助 / 退稅等
            </p>
          }
        />
        <MetricCard
          label={
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-xs font-medium tracking-tight text-foreground/80 normal-case">
                <PiggyBank className="size-3" />
                收入有多少存下來
              </span>
              <span className="text-[10px] font-medium tracking-wider text-muted-foreground/60 uppercase">
                當月儲蓄率
              </span>
            </span>
          }
          value={PREVIEW.savingsRate}
          valueClassName="text-emerald-600 dark:text-emerald-400"
          footer={
            <p className="text-[11px] text-muted-foreground/70">
              達標 — 維持穩健理財節奏
            </p>
          }
        />
      </div>

      {/* 預算進度 — 手刻靜態長條而不用 ui/progress，因為那支是 client component，
          這裡只需要一張不會動的示意圖，沒必要為此把整段送進瀏覽器執行 */}
      <Card className="mt-3 gap-4 px-4 py-4 ring-1 ring-foreground/10">
        <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          本月預算使用情形
        </p>
        <div className="flex flex-col gap-3">
          {PREVIEW.budgets.map((b) => (
            <div key={b.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium">{b.label}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    b.over
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-muted-foreground"
                  )}
                >
                  {b.used} / {b.total}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    b.over
                      ? "bg-rose-500"
                      : b.pct >= 70
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  )}
                  style={{ width: `${b.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/70">
          娛樂休閒已超出預算 — 這種情況它會直接推 LINE 通知你，不用等你自己發現。
        </p>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground/70">
        以上為示意數字，登入後看到的是你自己的資料。
      </p>
    </AboutSection>
  );
}

interface MetricCardProps {
  label: React.ReactNode;
  value: string;
  valueClassName: string;
  footer: React.ReactNode;
}

function MetricCard({ label, value, valueClassName, footer }: MetricCardProps) {
  return (
    <Card className="gap-0 px-4 py-3 ring-1 ring-foreground/10">
      {typeof label === "string" ? (
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
      ) : (
        label
      )}
      <p
        className={cn(
          "mt-1 text-2xl font-bold tracking-tight tabular-nums",
          valueClassName
        )}
      >
        {value}
      </p>
      <div className="mt-1">{footer}</div>
    </Card>
  );
}
