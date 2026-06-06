"use client";

/**
 * 📂 已封存資產追溯面板 (per 0027 軟刪除 + 原因追銷的最後一塊)。
 *
 * 設計哲學:
 *   - 「不要打擾現役視角，但可被翻找」— 默認摺疊、配色克制 (muted)，標題只
 *     露「(N)」徽章。展開後才浮出歷史。
 *   - 「人文工匠情懷」— 用 timeline 結構（左側細線 + 圓點）呈現歷史軸；
 *     刪除線給名稱「已退役」感；archive_reason 用 italic 弱化但保留 user
 *     當時的決策記憶。
 *   - Accordion 走 base-ui (per @/components/ui/accordion) — 動畫已內建。
 *
 * Empty state 不擋 — 0 筆時面板還是在，但展開只顯示溫和提示「歷史完整無瑕」。
 */

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Money } from "@/components/ui/money";
import {
  findFrozenValue,
  formatTwd,
  type WealthAccountRow,
  type WealthSnapshotRow,
} from "@/lib/wealth";

interface Props {
  archived: WealthAccountRow[];
  /** loadWealth() 撈到的 snapshots — 給 findFrozenValue 反查歷史值用 */
  snapshots: WealthSnapshotRow[];
}

export function ArchivedWealthAccounts({ archived, snapshots }: Props) {
  return (
    <Accordion
      className="mt-8 rounded-xl bg-muted/20 px-4 ring-1 ring-foreground/5"
    >
      <AccordionItem value="archived" className="border-0">
        <AccordionTrigger
          // 克制 muted 配色：標題色比一般內文還淡半度
          // hover:no-underline 蓋掉 base 預設 underline，維持高級感
          className="hover:no-underline focus-visible:ring-foreground/10"
        >
          <span className="flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-muted-foreground/70">
            <span aria-hidden>📂</span>
            <span>展開已封存資產</span>
            <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-normal tabular-nums text-muted-foreground/80 ring-1 ring-foreground/10">
              {archived.length}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          {archived.length === 0 ? (
            <p className="px-1 py-2 text-xs italic text-muted-foreground/60">
              你的資產歷史完整無瑕 — 尚未封存任何帳戶。
            </p>
          ) : (
            <ol
              aria-label="已封存資產時間軸"
              className="relative ml-1 flex flex-col gap-5 border-l border-foreground/10 pl-5 py-1"
            >
              {archived.map((acc) => {
                const frozenValue = findFrozenValue(acc.id, snapshots);
                return (
                  <li key={acc.id} className="relative">
                    {/* timeline 圓點 — ring 用 bg-card 創造「穿透 line」的視覺切口 */}
                    <span
                      aria-hidden
                      className="absolute -left-[27px] top-2 size-2.5 rounded-full bg-muted-foreground/30 ring-2 ring-background"
                    />

                    {/* 主列：刪除線名稱 / 凍結估值 / 封存日 */}
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-muted-foreground/70 line-through decoration-muted-foreground/30 decoration-1 underline-offset-2">
                        {acc.name}
                      </span>
                      <div className="flex shrink-0 items-baseline gap-3 text-[11px]">
                        <span className="tabular-nums text-muted-foreground/70">
                          {frozenValue === null ? (
                            <span className="italic text-muted-foreground/40">
                              估值未拍攝
                            </span>
                          ) : (
                            <>
                              封存時
                              <span className="ml-1.5 font-medium text-muted-foreground/90">
                                <Money value={frozenValue} format={formatTwd} />
                              </span>
                            </>
                          )}
                        </span>
                        <span className="font-mono text-muted-foreground/50">
                          {formatArchivedAt(acc.archived_at)}
                        </span>
                      </div>
                    </div>

                    {/* 副列：原因 (italic + 更淡，引用樣式) */}
                    {acc.archive_reason && (
                      <p className="mt-1.5 text-xs italic leading-relaxed text-muted-foreground/55">
                        <span className="mr-1 text-muted-foreground/35">“</span>
                        {acc.archive_reason}
                        <span className="ml-1 text-muted-foreground/35">”</span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/**
 * archived_at ISO timestamp → "YYYY/MM/DD"（Asia/Taipei）。
 * 不顯示時間是有意的 — 月度資產追溯場景，日期精度足矣，時分秒會增加視覺噪音。
 */
function formatArchivedAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replaceAll("/", "/"); // zh-TW Intl 已用 "/"；保險 normalize
}
