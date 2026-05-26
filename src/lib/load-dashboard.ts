import { createClient } from "@/lib/supabase/server";
import type {
  AccountRow,
  AssetRow,
  DebtRow,
  RecurringRow,
  TransactionRow,
  UserRow,
} from "@/lib/dashboard";

async function safeList<T>(
  promise: PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  try {
    const { data, error } = await promise;
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export interface DashboardSnapshot {
  user: UserRow | null;
  assets: AssetRow[];
  debts: DebtRow[];
  recurring: RecurringRow[];
  transactions: TransactionRow[];
  accounts: AccountRow[];
}

/**
 * 共用的 RSC 載入函式：把首頁所需的 Supabase 全表抓取集中起來，
 * 4 個 page route 都會用同一份。Next 16 RSC fetch cache 在單一 request
 * 內會 dedupe，但跨頁切換每次都會重抓 — 對個人記帳規模可接受。
 */
export async function loadDashboard(): Promise<DashboardSnapshot> {
  const supabase = await createClient();
  const userPromise = (async () => {
    try {
      const { data } = await supabase
        .from("users")
        .select("*")
        .limit(1)
        .maybeSingle();
      return data as UserRow | null;
    } catch {
      return null;
    }
  })();

  const [user, assets, debts, recurring, transactions, accounts] =
    await Promise.all([
      userPromise,
      safeList<AssetRow>(supabase.from("assets").select("*")),
      safeList<DebtRow>(supabase.from("debts").select("*")),
      safeList<RecurringRow>(supabase.from("recurring_payments").select("*")),
      safeList<TransactionRow>(supabase.from("transactions").select("*")),
      safeList<AccountRow>(supabase.from("accounts").select("*")),
    ]);

  return { user, assets, debts, recurring, transactions, accounts };
}
