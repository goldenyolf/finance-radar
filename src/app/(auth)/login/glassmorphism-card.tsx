"use client";

import { motion } from "framer-motion";

import { LoginForm } from "./login-form";

/**
 * 毛玻璃登入卡片 — Apple FinTech 美學。
 *
 * 視覺設計：
 *   - 寬度約 400px (max-w-sm = 384px)
 *   - 半透明深色底 + backdrop-blur-xl = 浮在夜空漸層上的玻璃感
 *   - 微透明白邊框做高光
 *   - shadow-2xl 加深景深
 *   - emerald 點綴（focus ring 由 input 處理）
 *
 * 進場動畫（per spec）：opacity 0 + scale 0.95 → opacity 1 + scale 1，
 * 0.5s easeOut，視覺上像「從夜空浮現」。
 */
export function GlassmorphismLoginCard() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-sm"
    >
      <div className="mb-8 text-center">
        <p className="text-xs font-medium tracking-widest text-slate-400 uppercase">
          Money Radar
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          個人財務戰情室
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          登入帳號或註冊新會員
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-6 py-8 shadow-2xl backdrop-blur-xl">
        <LoginForm />
      </div>

      <p className="mt-6 text-center text-xs text-slate-500">
        資料完全隔離，每位會員只會看到自己的記帳紀錄
      </p>
    </motion.div>
  );
}
