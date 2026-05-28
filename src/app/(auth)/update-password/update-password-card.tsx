"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2Icon,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

/**
 * 重設密碼卡 — 跟 ForgotPasswordCard 同款毛玻璃風。
 *
 * 流程：
 *   1. 使用者點信件 magic link → 跳到本頁，URL 帶 access_token 在 fragment
 *   2. createBrowserClient (detectSessionInUrl=true) 自動建 recovery session
 *   3. 表單輸入新密碼 + 確認新密碼
 *   4. 提交時先做客戶端驗證：兩次一致 + 長度 ≥ 6（避免無謂 API call）
 *   5. 呼叫 supabase.auth.updateUser({ password: newPassword })
 *   6. 成功 → success 狀態 + 3 秒倒數自動跳 /login
 *
 * 邊界：使用者直接打 /update-password 沒走信件流程 → updateUser 會回
 * auth error，我們 setError 顯示「連結已過期或無效」。
 */
export function UpdatePasswordCard() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const passwordId = useId();
  const confirmId = useId();

  // 成功後 3 秒自動跳 /login
  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => {
      router.push("/login");
    }, 3000);
    return () => window.clearTimeout(t);
  }, [success, router]);

  const inputClass =
    "h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 " +
    "focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/40";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Client-side guards — 省一次 API call
    if (password.length < 6) {
      setError("新密碼至少 6 個字元");
      return;
    }
    if (password !== confirmPassword) {
      setError("兩次密碼輸入不一致");
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const { error: apiError } = await supabase.auth.updateUser({
          password,
        });
        if (apiError) {
          const friendly = translateAuthError(apiError.message);
          setError(friendly);
          toast.error("密碼更新失敗", { description: friendly });
          return;
        }

        // 安全規範：密碼重設後強制登出 recovery session，逼使用者用「新密碼」
        // 重新登入。好處：(1) 驗證使用者真的記得新密碼 (2) 作廢 recovery token
        // (3) 萬一信箱被盜，attacker 改完還要再走一次登入降低風險。
        //
        // Best-effort：signOut 失敗也不擋成功 UX，反正 3 秒後 redirect 到 /login
        // 會強制重新輸入帳密。
        try {
          await supabase.auth.signOut();
        } catch {
          // 靜默失敗
        }

        setSuccess(true);
        toast.success("✅ 密碼已成功更新", {
          description: "為了安全，請使用新密碼重新登入",
        });
      } catch {
        const friendly = "更新失敗，請稍後再試";
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
          {success ? "密碼已重設" : "設定新密碼"}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {success
            ? "為了安全，請用新密碼重新登入"
            : "輸入新密碼以完成重設流程"}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-6 py-8 shadow-2xl backdrop-blur-xl">
        {success ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <span
              aria-hidden
              className="grid size-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
            >
              <CheckCircle2 className="size-6" />
            </span>
            <p className="text-sm leading-relaxed text-slate-200">
              ✅ 密碼已成功更新
            </p>
            <p className="text-[11px] text-slate-500">
              3 秒後自動跳回登入頁，請使用新密碼重新登入
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label
                htmlFor={passwordId}
                className="text-sm font-medium text-slate-200"
              >
                新密碼
              </Label>
              <Input
                id={passwordId}
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                autoFocus
                placeholder="至少 6 個字元"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor={confirmId}
                className="text-sm font-medium text-slate-200"
              >
                確認新密碼
              </Label>
              <Input
                id={confirmId}
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="再輸入一次"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                    更新中
                  </>
                ) : (
                  <>
                    <Lock className="size-4" />
                    更新密碼
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

/**
 * Supabase auth 錯誤訊息英→中 mapping。沒命中規則 → 回原文 fallback。
 *
 * 順序很重要 — 從最具體到最通用，避免短關鍵字（如 "password"）提早 hijack
 * 長關鍵字（如 "same as previous password"）。
 */
function translateAuthError(msg: string): string {
  const lower = msg.toLowerCase();

  // 跟舊密碼相同 — 最具體先測
  if (lower.includes("same") && lower.includes("password")) {
    return "新密碼不能跟舊密碼相同，請換一組";
  }
  // session / token 失效 — Phase 2 最常見的（信件放 1 小時以上 token 過期）
  if (
    lower.includes("session") ||
    lower.includes("expired") ||
    lower.includes("invalid") ||
    lower.includes("not authenticated") ||
    lower.includes("jwt")
  ) {
    return "重設連結已過期或無效，請回到「忘記密碼」重新申請一次";
  }
  // 密碼太弱 / 太短
  if (
    lower.includes("weak") ||
    lower.includes("short") ||
    (lower.includes("password") && lower.includes("least"))
  ) {
    return "密碼太短，至少 6 個字元";
  }
  // rate limit
  if (lower.includes("rate")) return "請求過於頻繁，請稍候再試";
  // 網路
  if (lower.includes("network") || lower.includes("fetch")) {
    return "網路異常，請檢查連線後重試";
  }
  return msg;
}
