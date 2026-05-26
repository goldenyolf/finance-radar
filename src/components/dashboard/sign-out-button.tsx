"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

/**
 * 登出按鈕。呼叫 server action signOut() — server 端 supabase.auth.signOut
 * 寫回過期 session cookies，再 redirect /login。
 */
export function SignOutButton({ className }: Props) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await signOut();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label="登出"
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-rose-500/[0.06] hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-50",
        className
      )}
    >
      <LogOut className="size-4" />
      {pending ? "登出中" : "登出"}
    </button>
  );
}
