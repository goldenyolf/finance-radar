import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AboutSection } from "./section";

/**
 * 收尾 CTA + 頁尾。
 *
 * 兩個連結都指向 /login，不在這裡判斷登入狀態 — login/page.tsx 的
 * server-side getUser() 已經會把已登入的人 redirect 回 /，所以老用戶點
 * 「免費開始使用」也會正確地回到自己的儀表板。少一次 auth 查詢，
 * /about 就能維持完全靜態。
 */
export function AboutFinalCta() {
  return (
    <>
      <AboutSection className="border-t border-foreground/5 text-center">
        <h2 className="mx-auto max-w-xl font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {/* 同 hero：窄螢幕在逗號後斷行，避免「就」被留在行尾 */}
          今天的午餐錢，
          <br className="sm:hidden" />
          就從一句話開始記
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-pretty text-muted-foreground sm:text-base">
          註冊完綁上 LINE，下一餐就能開始記帳。前面那些分析會自己長出來。
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 w-full rounded-xl px-6 text-base sm:w-auto"
            )}
          >
            免費開始使用
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "ghost", size: "lg" }),
              "h-11 w-full rounded-xl px-6 text-base sm:w-auto"
            )}
          >
            已經有帳號？登入
          </Link>
        </div>
      </AboutSection>

      <footer className="border-t border-foreground/5 px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <span className="font-medium tracking-widest uppercase">
            Money Radar
          </span>
          <span>個人財務戰情室 — 一句話記帳，自動跑分析</span>
        </div>
      </footer>
    </>
  );
}
