import { cn } from "@/lib/utils";

interface Props {
  /** 大白話主標 — 第一次進來的人不用學就懂的說法 */
  plain: string;
  /** 專業術語副標 — 保留原本的財務用詞 */
  term: string;
  /** 主標左側的 icon（可選） */
  icon?: React.ReactNode;
  /** 掛在主標右側的東西，通常是 <HelpTip> */
  children?: React.ReactNode;
  className?: string;
}

/**
 * 🪧 雙層標籤 — 主標大白話、副標專業術語。
 *
 * 為什麼要兩層而不是二選一：
 *   - 只留術語（「硬性負擔率」）→ 沒有財務背景的人第一眼看不懂，卡在這裡；
 *   - 只留白話（「每月被綁死的錢」）→ 用久的人失去一個能拿去 Google、
 *     能跟理專對話的正式名詞，產品的專業感也一起掉了。
 *
 * 兩層並存的好處是使用者會自己把兩個詞對起來 — 看白話懂意思、看術語學名字，
 * 幾次之後術語就內化了。這比 tooltip 更有效：tooltip 要「主動去點」才看得到，
 * 副標是「被動就吃進去」。
 *
 * HelpTip 仍然該掛（傳進 children）— 它負責講「怎麼算的、標準是多少」，
 * 副標只負責講「這個東西叫什麼」，兩者不重疊。
 */
export function DualLabel({ plain, term, icon, children, className }: Props) {
  return (
    <span className={cn("flex flex-col gap-0.5", className)}>
      <span className="flex items-center gap-1.5 text-xs font-medium tracking-tight text-foreground/80">
        {icon}
        {plain}
        {children}
      </span>
      <span className="text-[10px] font-medium tracking-wider text-muted-foreground/60 uppercase">
        {term}
      </span>
    </span>
  );
}
