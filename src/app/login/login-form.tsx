"use client";

import { useActionState, useId } from "react";
import { Loader2Icon, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "./actions";

const INITIAL_STATE: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, INITIAL_STATE);
  const pinId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={pinId} className="text-sm font-medium">
          密碼
        </Label>
        <Input
          id={pinId}
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          autoFocus
          required
          placeholder="輸入 PIN 解鎖"
          className="h-11 text-base tabular-nums"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-md bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-500/20 dark:text-rose-300"
        >
          {state.error}
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
            驗證中
          </>
        ) : (
          <>
            <Lock className="size-4" />
            解鎖
          </>
        )}
      </Button>
    </form>
  );
}
