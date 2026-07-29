import { cn } from "@/lib/utils";

interface SectionProps extends React.ComponentProps<"section"> {
  children: React.ReactNode;
}

/**
 * 介紹頁區塊外殼 — 統一寬度與上下留白，避免六個區塊各自抓一組 max-w
 * 而在視覺上左右邊界對不齊。
 *
 * scroll-mt-16：`#how` 這類錨點跳轉時，讓標題不要頂在視窗最上緣。
 */
export function AboutSection({ className, children, ...props }: SectionProps) {
  return (
    <section
      className={cn(
        "mx-auto max-w-5xl scroll-mt-16 px-6 py-16 sm:py-20",
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}

interface HeadingProps {
  /** 小字前導 — 講「這一段在回答什麼問題」 */
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}

/**
 * 區塊標題 — 主標一律大白話，術語降到 description 或內文小字。
 * 跟 DualLabel 同一條產品原則：第一次來的人不用先學名詞才看得懂。
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: HeadingProps) {
  return (
    <div className={cn("mx-auto max-w-2xl text-center", className)}>
      {eyebrow ? (
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-3 text-sm text-pretty text-muted-foreground sm:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}
