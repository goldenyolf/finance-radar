"use client";

import { useActionState, useId, useState } from "react";
import { Loader2Icon, LogIn, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { signIn, signUp, type AuthState } from "./actions";

const INITIAL: AuthState = { error: null };

type Mode = "signin" | "signup";

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin");

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList className="grid w-full grid-cols-2">
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

      {mode === "signin" ? <SignInForm /> : <SignUpForm />}
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

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={emailId} className="text-sm font-medium">
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
          className="h-11"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={passwordId} className="text-sm font-medium">
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
          className="h-11"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-500/20 dark:text-rose-300"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="mt-1 h-11 w-full gap-1.5 rounded-full"
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
    </form>
  );
}
