import { TrendingDown, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatTwd, type DisplayAccount } from "@/lib/wealth";

interface Props {
  accounts: DisplayAccount[];
}

/**
 * 資產 / 負債兩欄式清單。
 *
 * 每個 row 顯示帳戶名稱 + 最新快照中的市值；該帳戶在最新快照沒值（新建 / 上次
 * 漏填）就顯示 "—" 灰字 → 「拍快照」時補上去。
 *
 * 沒任何帳戶 → 顯示 empty hint，Phase 4 那顆「📸 更新快照」會引導建立。
 */
export function WealthAccountsList({ accounts }: Props) {
  const assets = accounts.filter((a) => a.type === "asset");
  const liabilities = accounts.filter((a) => a.type === "liability");

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
          還沒設定任何財富帳戶。點上方「📸 更新本月資產快照」開始建立。
        </CardContent>
      </Card>
    );
  }

  return (
    <section
      aria-label="財富帳戶清單"
      className="grid grid-cols-1 gap-4 lg:grid-cols-2"
    >
      <AccountColumn
        title="資產"
        subtitle="存款、投資、不動產等正資產"
        icon={
          <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
        }
        items={assets}
        emptyHint="尚未建立任何資產帳戶"
        tone="positive"
      />
      <AccountColumn
        title="負債"
        subtitle="房貸、車貸、信用卡循環等"
        icon={
          <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />
        }
        items={liabilities}
        emptyHint="尚未建立任何負債帳戶"
        tone="danger"
      />
    </section>
  );
}

interface ColumnProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: DisplayAccount[];
  emptyHint: string;
  tone: "positive" | "danger";
}

const TONE_VALUE: Record<ColumnProps["tone"], string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  danger: "text-rose-600 dark:text-rose-400",
};

function AccountColumn({
  title,
  subtitle,
  icon,
  items,
  emptyHint,
  tone,
}: ColumnProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/10 bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
            {emptyHint}
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((acc) => (
              <li
                key={acc.id}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
              >
                <span className="truncate text-sm font-medium">
                  {acc.name}
                </span>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    acc.value === null
                      ? "text-muted-foreground/60"
                      : TONE_VALUE[tone]
                  }`}
                >
                  {acc.value === null ? "—" : formatTwd(acc.value)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
