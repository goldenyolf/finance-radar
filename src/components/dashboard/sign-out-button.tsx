"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

interface Props {
  /** sidebar 摺疊狀態 — true 時隱藏文字、icon 置中。 */
  collapsed?: boolean;
  className?: string;
}

/**
 * 登出按鈕。呼叫 server action signOut() — server 端 supabase.auth.signOut
 * 寫回過期 session cookies，再 redirect /login。
 */
export function SignOutButton({ collapsed = false, className }: Props) {
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
        "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-rose-500/[0.06] hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-50",
        collapsed ? "justify-center px-2" : "px-3",
        className
      )}
    >
      <LogOut className="size-4" />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-all duration-300",
          collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
        )}
      >
        {pending ? "登出中" : "登出"}
      </span>
    </button>
  );
}
