import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatCurrency, type ForecastItem, type ForecastPoint } from "@/lib/dashboard";

interface Props {
  points: ForecastPoint[];
}

function netToneClass(n: number) {
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-rose-600 dark:text-rose-400";
  return "text-muted-foreground";
}

function formatSignedAmount(n: number) {
  const abs = formatCurrency(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return `±${abs}`;
}

function balanceClass(n: number) {
  return n < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground";
}

export function ForecastDetailAccordion({ points }: Props) {
  return (
    <Accordion className="divide-y divide-foreground/10">
      {points.map((p) => (
        <AccordionItem
          key={`${p.year}-${p.monthIndex}`}
          value={`${p.year}-${p.monthIndex}`}
          className="border-none"
        >
          <AccordionTrigger className="px-1 py-3 hover:no-underline">
            <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pr-2">
              <span className="text-sm font-medium tracking-tight">
                {p.monthLabel}
              </span>
              <span className="flex flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0.5">
                <span
                  className={`text-sm font-semibold tabular-nums ${balanceClass(p.projectedBalance)}`}
                >
                  預估餘額 {formatCurrency(p.projectedBalance)}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  （當月淨流{" "}
                  <span className={netToneClass(p.netCashflow)}>
                    {formatSignedAmount(p.netCashflow)}
                  </span>
                  ）
                </span>
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-1">
            <div className="grid grid-cols-1 gap-4 pt-1 pb-3 sm:grid-cols-2">
              <ItemColumn
                accent="positive"
                label="預計收入"
                items={p.expectedIncomes}
              />
              <ItemColumn
                accent="negative"
                label="預計支出"
                items={p.expectedExpenses}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

interface ItemColumnProps {
  accent: "positive" | "negative";
  label: string;
  items: ForecastItem[];
}

function ItemColumn({ accent, label, items }: ItemColumnProps) {
  const isPos = accent === "positive";
  const dotClass = isPos ? "bg-emerald-500" : "bg-rose-500";
  const amountClass = isPos
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
  const sign = isPos ? "+" : "−";

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center gap-2">
        <span
          aria-hidden
          className={`inline-block size-2 rounded-full ${dotClass}`}
        />
        <h4 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </h4>
      </header>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-foreground/10 bg-muted/30 px-3 py-3 text-center text-xs text-muted-foreground">
          無預計項目
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item, idx) => (
            <li
              key={`${item.title}-${idx}`}
              className="flex items-baseline justify-between gap-3 rounded-md px-1 py-1"
            >
              <span className="min-w-0 truncate text-sm">{item.title}</span>
              <span
                className={`shrink-0 text-sm font-medium tabular-nums ${amountClass}`}
              >
                {sign}
                {formatCurrency(item.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
