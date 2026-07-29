import {
  CalendarDays,
  Gauge,
  Landmark,
  PieChart,
  TrendingUp,
  Waypoints,
} from "lucide-react";

import { AboutSection, SectionHeading } from "./section";

interface Feature {
  icon: React.ReactNode;
  /** 大白話主標 */
  plain: string;
  /** 產品裡實際的名字 — 讓人之後在 App 裡找得到同一個東西 */
  term: string;
  detail: string;
}

const FEATURES: Feature[] = [
  {
    icon: <TrendingUp className="size-5" />,
    plain: "錢從哪來、往哪去",
    term: "現金流走勢",
    detail: "收入與支出疊在同一條時間軸上，一眼看出哪個月開始入不敷出。",
  },
  {
    icon: <PieChart className="size-5" />,
    plain: "哪一類默默吃掉最多錢",
    term: "分類佔比",
    detail: "把每一筆歸到它該去的類別，包含你自己新增的分類，不會全糊成「其他」。",
  },
  {
    icon: <CalendarDays className="size-5" />,
    plain: "哪幾天最容易失手",
    term: "每日消費節奏",
    detail: "用日曆熱度看出你的花錢慣性 — 週五晚上、月初發薪日，通常都不無辜。",
  },
  {
    icon: <Waypoints className="size-5" />,
    plain: "薪水一層層流去了哪裡",
    term: "金流路徑圖",
    detail: "從收入出發，經過各個帳戶，最後落在哪些支出上，整條路徑畫給你看。",
  },
  {
    icon: <Gauge className="size-5" />,
    plain: "每個月被綁死的錢佔多少",
    term: "財務彈性",
    detail: "房租、房貸、訂閱這些逃不掉的固定支出算成一個比率，順便告訴你突然沒收入能撐幾個月。",
  },
  {
    icon: <Landmark className="size-5" />,
    plain: "扣掉負債後真正屬於你的數字",
    term: "資產淨值",
    detail: "把帳戶、投資、負債合起來算成一個數字，逐月記錄它有沒有在長大。",
  },
];

/**
 * 六個分析維度 — 每格「白話主標 + 術語副標 + 一句說明」。
 *
 * 排版刻意跟 ui/dual-label.tsx 同一個原則：主標讓人看懂，副標讓人學到產品裡
 * 的正式名字。介紹頁是使用者第一次接觸這些名詞的地方，這裡先把兩層對起來，
 * 之後進 App 看到「財務彈性」就不會陌生。
 */
export function AboutFeatureGrid() {
  return (
    <AboutSection className="border-t border-foreground/5">
      <SectionHeading
        eyebrow="自動跑的分析"
        title="記完帳之後，它幫你看六件事"
        description="這些都不用你按任何按鈕。每記一筆，六個維度就同步重算一次。"
      />

      <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.term} className="flex flex-col gap-2">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {f.icon}
            </span>
            <h3 className="mt-1 font-heading text-base leading-snug font-medium">
              {f.plain}
            </h3>
            <p className="text-[10px] font-medium tracking-wider text-muted-foreground/60 uppercase">
              {f.term}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {f.detail}
            </p>
          </div>
        ))}
      </div>
    </AboutSection>
  );
}
