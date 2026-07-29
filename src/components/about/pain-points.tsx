import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { AboutSection, SectionHeading } from "./section";

interface Contender {
  label: string;
  verdict: string;
  detail: string;
  /** true = 這是我們自己，套 emerald 高亮 */
  highlight?: boolean;
}

const CONTENDERS: Contender[] = [
  {
    label: "一般記帳 App",
    verdict: "只記，不分析",
    detail:
      "你認真記了三個月，換來一份長長的清單。錢到底花去哪、能不能再花，還是得自己想。",
  },
  {
    label: "Excel / Notion",
    verdict: "分析得動，但要你動",
    detail:
      "每個月手動貼上、拉公式、對帳。第一個月很有幹勁，第二個月表格就停在那裡了。",
  },
  {
    label: "Money Radar",
    verdict: "記帳零摩擦，分析自動跑",
    detail:
      "在 LINE 講一句話就記完。記完那一秒，分析、預算警報、資產淨值全部同步更新。",
    highlight: true,
  },
];

/**
 * 痛點對照 — 三欄「你現在用的 vs 我們」。
 *
 * 為什麼用對照而不是直接列功能：陌生人打開介紹頁時腦裡的問題不是
 * 「它有什麼功能」，而是「我已經有記帳 App / 一張試算表了，為什麼要換」。
 * 先回答那個問題，功能清單才有人願意往下看。
 */
export function AboutPainPoints() {
  return (
    <AboutSection>
      <SectionHeading
        eyebrow="為什麼要再多一個理財工具"
        title="記帳工具很多，能幫你做決定的很少"
        description="市面上的選擇大概落在兩個極端 — 一邊記得很輕鬆但看不出東西，一邊看得出東西但要你每個月手動整理。"
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {CONTENDERS.map((c) => (
          <Card
            key={c.label}
            className={cn(
              "gap-3 px-5 py-5",
              c.highlight
                ? "ring-2 ring-emerald-500/40 dark:bg-emerald-500/5"
                : "ring-1 ring-foreground/10"
            )}
          >
            <p
              className={cn(
                "text-[11px] font-medium tracking-wider uppercase",
                c.highlight
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground"
              )}
            >
              {c.label}
            </p>
            <p className="font-heading text-base leading-snug font-semibold">
              {c.verdict}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {c.detail}
            </p>
          </Card>
        ))}
      </div>
    </AboutSection>
  );
}
