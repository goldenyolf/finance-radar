import { BellRing, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";

import { AboutSection, SectionHeading } from "./section";

interface Pillar {
  icon: React.ReactNode;
  title: string;
  detail: string;
  points: string[];
}

const PILLARS: Pillar[] = [
  {
    icon: <BellRing className="size-5" />,
    title: "它會主動來找你",
    detail:
      "理財工具最大的問題是「你不打開它就等於不存在」。這裡反過來 — 該提醒的時候它自己找上門。",
    points: [
      "某一類快超出預算時，直接推 LINE 給你",
      "訂閱扣款日前先提醒一次，避免忘記的自動續約",
      "不用記得打開 App，也不用另外設鬧鐘",
    ],
  },
  {
    icon: <ShieldCheck className="size-5" />,
    title: "你的數字只有你看得到",
    detail:
      "財務資料是最私人的東西之一。隔離不是靠前端藏起來，是在資料庫層級就把每個人的紀錄鎖在自己的帳號底下。",
    points: [
      "每一筆紀錄綁定你的帳號，資料庫層級強制隔離",
      "要給別人看畫面時，一鍵把所有金額糊掉",
      "沒有廣告、不拿你的消費紀錄去換別的東西",
    ],
  },
];

/**
 * 信任訊號 — 主動提醒 + 隱私。
 *
 * 放在功能清單之後、最後 CTA 之前，是因為看到這裡的人已經被功能說服了，
 * 剩下攔住他註冊的是兩個疑慮：「我會不會又忘記用」跟「我的錢的數字交給你安全嗎」。
 * 這一段專門回答這兩件事。
 */
export function AboutTrustStrip() {
  return (
    <AboutSection className="border-t border-foreground/5">
      <SectionHeading
        eyebrow="用得下去的關鍵"
        title="不用你記得用，也不用擔心給誰看到"
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {PILLARS.map((p) => (
          <Card key={p.title} className="gap-3 px-5 py-5 ring-1 ring-foreground/10">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {p.icon}
            </span>
            <h3 className="font-heading text-base leading-snug font-medium">
              {p.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {p.detail}
            </p>
            <ul className="mt-1 flex flex-col gap-1.5">
              {p.points.map((point) => (
                <li
                  key={point}
                  className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                >
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-emerald-500" />
                  {point}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </AboutSection>
  );
}
