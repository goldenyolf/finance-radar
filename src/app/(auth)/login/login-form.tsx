"use client";

import { useActionState, useId, useState } from "react";
import { motion } from "framer-motion";
import { Loader2Icon, LogIn, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { signIn, signUp, type AuthState } from "@/lib/actions/auth";

const INITIAL: AuthState = { error: null };

type Mode = "signin" | "signup";

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin");

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList className="grid w-full grid-cols-2 bg-white/5">
          <TabsTrigger value="signin" className="gap-1.5">
            <LogIn className="size-3.5" />
            登入
          </TabsTrigger>
          <TabsTrigger value="signup" className="gap-1.5">
            <UserPlus className="size-3.5" />
            註冊
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 用 motion.div 加 key 切換做交叉淡入，比 if/else 直接切換滑順 */}
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {mode === "signin" ? <SignInForm /> : <SignUpForm />}
      </motion.div>
    </div>
  );
}

function SignInForm() {
  const [state, formAction, pending] = useActionState(signIn, INITIAL);
  return (
    <AuthFormBody
      formAction={formAction}
      pending={pending}
      error={state.error}
      submitLabel="登入"
      submitIcon={<LogIn className="size-4" />}
    />
  );
}

function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, INITIAL);
  return (
    <AuthFormBody
      formAction={formAction}
      pending={pending}
      error={state.error}
      submitLabel="建立帳號"
      submitIcon={<UserPlus className="size-4" />}
    />
  );
}

interface BodyProps {
  formAction: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  submitLabel: string;
  submitIcon: React.ReactNode;
}

function AuthFormBody({
  formAction,
  pending,
  error,
  submitLabel,
  submitIcon,
}: BodyProps) {
  const emailId = useId();
  const passwordId = useId();

  // 輸入框統一樣式：玻璃底 + emerald focus ring，跟卡片質感一致
  const inputClass =
    "h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 " +
    "focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/40";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={emailId} className="text-sm font-medium text-slate-200">
          Email
        </Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          className={inputClass}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={passwordId} className="text-sm font-medium text-slate-200">
          密碼
        </Label>
        <Input
          id={passwordId}
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="current-password"
          placeholder="至少 6 個字元"
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

      {/* 按鈕外層 motion 包裝：hover 微微脹大 + 霓虹光暈、按壓回彈 */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="mt-1"
      >
        <Button
          type="submit"
          size="lg"
          className="h-11 w-full gap-1.5 rounded-full bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 transition-shadow hover:bg-emerald-400 hover:shadow-emerald-500/50 disabled:opacity-50"
          disabled={pending}
        >
          {pending ? (
            <>
              <Loader2Icon className="size-4 animate-spin" />
              處理中
            </>
          ) : (
            <>
              {submitIcon}
              {submitLabel}
            </>
          )}
        </Button>
      </motion.div>
    </form>
  );
}
