"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2Icon, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteRecurring } from "@/lib/actions/recurring";

interface Props {
  id: string;
  title: string;
}

export function DeleteRecurringButton({ id, title }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (pending) return;
    if (!window.confirm(`確定要刪除「${title}」這個週期嗎？`)) return;
    startTransition(async () => {
      const result = await deleteRecurring(id);
      if (!result.ok) {
        toast.error("刪除失敗", { description: result.error });
        return;
      }
      toast.success("已刪除週期", { description: title });
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleClick}
      disabled={pending}
      aria-label="刪除"
    >
      {pending ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <Trash2 className="size-3.5 text-muted-foreground" />
      )}
    </Button>
  );
}
