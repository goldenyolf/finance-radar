"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Layers, Wallet } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface AccountOption {
  id: string;
  name: string;
}

interface Props {
  accounts: AccountOption[];
  /** Currently selected account id, or null for "All Accounts". */
  active: string | null;
}

const ALL = "__all__";

export function AccountSwitcher({ accounts, active }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next === ALL) sp.delete("account");
    else sp.set("account", next);
    const qs = sp.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const value = active ?? ALL;
  const activeName =
    active === null
      ? "全部資產總覽"
      : (accounts.find((a) => a.id === active)?.name ?? "選擇帳戶");

  return (
    <Select value={value} onValueChange={(v) => handleChange(v as string)}>
      <SelectTrigger
        className="h-9 min-w-56 rounded-full border-foreground/15 bg-background pl-3 pr-2 text-sm font-medium shadow-sm"
        data-pending={pending}
      >
        <SelectValue>
          <span className="flex items-center gap-2">
            {active === null ? (
              <Layers className="size-4 text-muted-foreground" />
            ) : (
              <Wallet className="size-4 text-muted-foreground" />
            )}
            <span>{activeName}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-64">
        <SelectItem value={ALL}>
          <span className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            全部資產總覽
          </span>
        </SelectItem>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <span className="flex items-center gap-2">
              <Wallet className="size-4 text-muted-foreground" />
              {a.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
