import { Mic, Receipt, Type } from "lucide-react";

import { cn } from "@/lib/utils";

import { AboutSection, SectionHeading } from "./section";

/** 一則對話氣泡 — side 決定靠左（機器人）或靠右（你） */
interface Bubble {
  side: "you" | "bot";
  /** 氣泡上方的小灰字，用來標示這是語音／圖片而不是純文字 */
  attachment?: string;
  lines: string[];
}

interface Channel {
  icon: React.ReactNode;
  label: string;
  note: string;
  bubbles: Bubble[];
}

const CHANNELS: Channel[] = [
  {
    icon: <Type className="size-4" />,
    label: "打字",
    note: "不用開 App、不用選分類，一行字就結束。",
    bubbles: [
      { side: "you", lines: ["午餐 120"] },
      {
        side: "bot",
        lines: ["✅ 已記帳：午餐 $120", "分類：餐飲食品 · 帳戶：現金錢包"],
      },
    ],
  },
  {
    icon: <Mic className="size-4" />,
    label: "講話",
    note: "手上提著東西、走在路上，按住講一句就好。",
    bubbles: [
      { side: "you", attachment: "🎙️ 語音訊息 0:03", lines: [] },
      {
        side: "bot",
        lines: [
          "🎙️ 聽到：「晚餐去吃了麥當勞花了一百五」",
          "✅ 已記帳：晚餐 麥當勞 $150",
        ],
      },
    ],
  },
  {
    icon: <Receipt className="size-4" />,
    label: "拍發票",
    note: "一張發票上有五筆消費，它一次全部拆好寫進去。",
    bubbles: [
      { side: "you", attachment: "📷 發票照片", lines: [] },
      {
        side: "bot",
        lines: ["📷 辨識到 5 筆消費，已批次記帳", "合計 $438 · 分類：日常採買"],
      },
    ],
  },
];

/**
 * LINE 記帳示意 — 純 CSS 對話氣泡，沒有截圖也沒有任何真實資料。
 *
 * 三個通道各給一組「你說 → 它回」，因為「零摩擦」這件事光用文字描述很虛，
 * 看到對話長什麼樣才有感。氣泡刻意做得像 LINE（你在右、綠底；機器人在左、
 * 灰底），讓人一眼認出這是發生在他每天都開的那個 App 裡。
 */
export function AboutLineChatDemo() {
  return (
    <AboutSection id="how" className="border-t border-foreground/5">
      <SectionHeading
        eyebrow="記帳這件事"
        title="記帳只剩「說一句話」"
        description="不用另外下載 App。在你本來就每天在用的 LINE 裡，打字、講話、拍發票都能記帳。"
      />

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {CHANNELS.map((channel) => (
          <div key={channel.label} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {channel.icon}
              </span>
              {channel.label}
            </div>

            {/* 對話框 — 模擬 LINE 聊天室的一小段 */}
            <div className="flex flex-col gap-2 rounded-2xl bg-muted/40 p-3 ring-1 ring-foreground/10">
              {channel.bubbles.map((bubble, i) => (
                <ChatBubble key={i} bubble={bubble} />
              ))}
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              {channel.note}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground/70">
        以上為對話示意，分類與帳戶由系統依你的設定自動判斷。
      </p>
    </AboutSection>
  );
}

function ChatBubble({ bubble }: { bubble: Bubble }) {
  const isYou = bubble.side === "you";

  return (
    <div className={cn("flex", isYou ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
          isYou
            ? "rounded-br-sm bg-emerald-500 text-white"
            : "rounded-bl-sm bg-background text-foreground ring-1 ring-foreground/10"
        )}
      >
        {bubble.attachment ? (
          <span className={cn(isYou ? "text-white/90" : "text-muted-foreground")}>
            {bubble.attachment}
          </span>
        ) : null}
        {bubble.lines.map((line, i) => (
          <p key={i} className={i > 0 ? "mt-1 opacity-80" : undefined}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
