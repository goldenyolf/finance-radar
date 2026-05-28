"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2Icon,
  Mail,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

/**
 * 忘記密碼卡 — 跟 LoginCard 同款毛玻璃風。
 *
 * 流程：
 *   1. 輸入 email → 按發送
 *   2. 呼叫 supabase.auth.resetPasswordForEmail，redirectTo 帶 origin/update-password
 *   3. Supabase 寄出 magic link → 使用者收信 → 點連結 → 回我們 /update-password 頁
 *      帶 access_token，那一頁讓使用者輸入新密碼
 *   4. 成功送出 → 卡片切到「✉️ 信件已寄出」狀態 + 返回登入連結
 *
 * 錯誤處理（Phase 3 會擴）：
 *   - email 格式錯 → 走 HTML5 required + type=email 阻擋（最簡）
 *   - Supabase API 噴錯 → setError 顯示中文錯誤 + Toast
 *   - 網路 throw → try/catch 接住
 */
export function ForgotPasswordCard() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const emailId = useId();

  const inputClass =
    "h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 " +
    "focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/40";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("請輸入 email");
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const { error: apiError } = await supabase.auth.resetPasswordForEmail(
          trimmed,
          {
            redirectTo: `${window.location.origin}/update-password`,
          }
        );
        if (apiError) {
          const friendly = translateAuthError(apiError.message);
          setError(friendly);
          toast.error("發送失敗", { description: friendly });
          return;
        }
        setSent(true);
        toast.success("✉️ 重設信已寄出", {
          description: "請到信箱查看連結（可能在垃圾郵件匣）",
        });
      } catch {
        const friendly = "發送失敗，請稍後再試";
        setError(friendly);
        toast.error(friendly);
      }
    });
  }

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
          {sent ? "信件已寄出" : "重設密碼"}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {sent
            ? "請到信箱點擊連結繼續流程"
            : "輸入您註冊用的 Email，我們會寄出重設連結"}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-6 py-8 shadow-2xl backdrop-blur-xl">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <span
              aria-hidden
              className="grid size-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
            >
              <CheckCircle2 className="size-6" />
            </span>
            <p className="text-sm leading-relaxed text-slate-200">
              ✉️ 重設連結已發送至您的信箱，請前往查看
            </p>
            <p className="text-[11px] text-slate-500">
              收不到？檢查垃圾郵件匣，或 1 分鐘後重試。
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label
                htmlFor={emailId}
                className="text-sm font-medium text-slate-200"
              >
                Email
              </Label>
              <Input
                id={emailId}
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-rose-500/[0.08] px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/30"
              >
                {error}
              </p>
            )}

            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="mt-1"
            >
              <Button
                type="submit"
                size="lg"
                disabled={pending}
                className="h-11 w-full gap-1.5 rounded-full bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 transition-shadow hover:bg-emerald-400 hover:shadow-emerald-500/50 disabled:opacity-50"
              >
                {pending ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    發送中
                  </>
                ) : (
                  <>
                    <Mail className="size-4" />
                    發送重設驗證信
                  </>
                )}
              </Button>
            </motion.div>
          </form>
        )}

        <div className="mt-5 border-t border-white/5 pt-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-emerald-300"
          >
            <ArrowLeft className="size-3" />
            返回登入
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

/** Supabase 英文錯誤 → 中文 fallback。沒命中就直接回原文。*/
function translateAuthError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("rate")) return "請求過於頻繁，請稍候再試";
  if (lower.includes("invalid") && lower.includes("email")) return "email 格式錯誤";
  if (lower.includes("network")) return "網路異常，請檢查連線";
  return msg;
}
