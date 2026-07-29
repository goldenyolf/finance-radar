"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";

/**
 * 介紹頁首屏 — 固定深色，刻意不吃 globals.css 的 light/dark token。
 *
 * 為什麼首屏要脫離主題系統：
 *   /about 的下一步永遠是 /login，而 (auth)/layout.tsx 是固定深色漸層
 *   （slate-950 → indigo-950）。首屏用同一組漸層，CTA 按下去畫面不會斷色，
 *   視覺上像走進同一個空間的下一個房間。往下捲的內容區才切回 token
 *   （見 about/page.tsx），那裡要展示「登入後長什麼樣」，必須用真 token。
 *
 * 因此這支所有顏色都是寫死的 slate/white/emerald，不能改成 bg-background
 * 之類的 token — 在 light 模式下會變成深底配深字。
 */
export function AboutHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      {/* 背景光暈 — 讓純漸層不那麼平，emerald 對應品牌的收入色 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl"
      />

      {/* 極簡頂欄 — 陌生人要找登入時不用往下捲 */}
      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-6 pt-6">
        <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">
          Money Radar
        </span>
        <Link
          href="/login"
          className="rounded-lg px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          登入
        </Link>
      </header>

      <div className="relative mx-auto max-w-3xl px-6 pt-16 pb-20 text-center sm:pt-24 sm:pb-28">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-xs font-medium tracking-widest text-emerald-400/90 uppercase"
        >
          個人財務戰情室
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          className="mt-4 text-3xl font-semibold tracking-tight text-balance text-white sm:text-5xl sm:leading-[1.1]"
        >
          {/* 窄螢幕強制在逗號後換行 — 讓瀏覽器自己斷會把「剩」孤字留在第一行行尾 */}
          一句話記帳，
          <br className="sm:hidden" />
          剩下的它幫你想
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.16, ease: "easeOut" }}
          className="mx-auto mt-5 max-w-xl text-base text-pretty text-slate-300 sm:text-lg"
        >
          在 LINE 打一句「午餐 120」就記完帳。它會自動分類、算出你這個月還能花多少，
          快超支的時候主動來提醒你。
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.24, ease: "easeOut" }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link
            href="/login"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-white px-6 text-base font-medium text-slate-950 shadow-lg shadow-black/20 transition-transform hover:scale-[1.02] active:translate-y-px sm:w-auto"
          >
            免費開始使用
          </Link>
          <a
            href="#how"
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 px-6 text-base text-slate-200 transition-colors hover:bg-white/5 hover:text-white sm:w-auto"
          >
            先看它怎麼運作
            <ArrowDown className="size-4" />
          </a>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.36 }}
          className="mt-8 text-xs text-slate-500"
        >
          資料完全隔離 · 每位會員只看得到自己的紀錄
        </motion.p>
      </div>
    </section>
  );
}
