import { Skull } from "lucide-react";

import { HelpTip } from "@/components/ui/help-tip";
import { Money } from "@/components/ui/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { TopMerchantPoint } from "@/lib/top-merchants";

interface Props {
  data: TopMerchantPoint[];
}

/**
 * 🧛 本月吸血鬼排行榜 — 揪出當月失血最大的 5 個消費對象。
 *
 * 視覺策略：
 *   - 排名 + 商家名 + 筆數（左上）
 *   - 金額 rose-600 / 400（右上）— 跟 expense 慣用色一致
 *   - 進度條長度 = 該商家占當月總支出 %（rose-500/80）→ 「失血量」一掃就懂
 *   - 百分比文字也帶 data-money，防窺模式下會被 blur（不會洩漏「某商家
 *     吃了 30% 支出」這種比例線索）
 *
 * Empty state：沒任何 expense（剛開新月份或 description 全部 null）
 * → 顯示提示，整張卡還是出現以保版位穩定。
 */
export function TopMerchantsList({ data }: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skull className="size-4 text-rose-600 dark:text-rose-400" />
          <CardTitle className="flex items-center gap-1.5 text-base">
            🧛 本月吸血鬼排行榜
            <span className="text-xs font-normal text-muted-foreground">
              Top Merchants
            </span>
            <HelpTip ariaLabel="吸血鬼排行榜說明">
              🔍 錢包黑手偵探：系統會自動清洗掉記帳明細中的（括號備註），提取核心消費對象並加總金額，幫您一眼抓出本月默默吸走最多現金流的店家或項目。
            </HelpTip>
          </CardTitle>
        </div>
        <CardDescription className="mt-1">
          名稱依「核心關鍵字」聚合（括號內備註會被自動忽略），抓出當月失血最猛的前 5 名。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
            本月還沒有任何已完成的支出紀錄
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {data.map((m, idx) => (
              <MerchantRow key={m.merchant} rank={idx + 1} point={m} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

interface RowProps {
  rank: number;
  point: TopMerchantPoint;
}

function MerchantRow({ rank, point }: RowProps) {
  const isTop = rank === 1;

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-baseline gap-2">
          <span
            className={`shrink-0 text-sm font-bold tabular-nums ${
              isTop
                ? "text-rose-600 dark:text-rose-400"
                : "text-muted-foreground"
            }`}
          >
            {rank}.
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{point.merchant}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              共 {point.count} 筆 ·{" "}
              {/* percentage 也視為敏感數字 — 揭露單一商家占月支出多少 */}
              <span data-money>{point.percentage.toFixed(1)}%</span>
              {" "}月支出
            </p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
          <Money value={point.amount} />
        </span>
      </div>
      {/*
        進度條長度直接 = 該項目佔月支出百分比；rose-500/80 帶透明度
        看起來不會像「警報」太突兀，但血腥感保留。
      */}
      <Progress
        value={point.percentage}
        aria-label={`${point.merchant} 失血量 ${point.percentage.toFixed(1)}%`}
        className="[&_[data-slot=progress-indicator]]:bg-rose-500/80 [&_[data-slot=progress-track]]:bg-rose-500/10"
      />
    </li>
  );
}
