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

export interface LoadDashboardOptions {
  /**
   * 只抓 `date >= transactionsSince`（ISO 'YYYY-MM-DD'）的 transactions。
   * 首頁只需要「上月（MoM 對比）＋本月（板塊 / 大字報）＋未來（預測）」，
   * 傳上月月初即可，對有長期歷史的使用者大幅砍掉抓取量。
   * 不傳 = 全歷史（分析頁需要歷史月份，維持原行為）。
   */
  transactionsSince?: string;
}

/**
 * 共用的 RSC 載入函式：把首頁所需的 Supabase 全表抓取集中起來，
 * 4 個 page route 都會用同一份。Next 16 RSC fetch cache 在單一 request
 * 內會 dedupe，但跨頁切換每次都會重抓 — 對個人記帳規模可接受。
 *
 * 進來先 fire-and-await `materialize_due_recurrings()` RPC：把已到期但還沒
 * 落地的週期性收支 INSERT 成 placeholder transactions。UNIQUE (recurring_id,
 * period) + ON CONFLICT DO NOTHING 保證重複呼叫零副作用；沒過期項目時
 * 函式本身 < 1ms 即返。RPC 失敗 (e.g. anonymous session) 安靜降級不阻塞載入。
 */
export async function loadDashboard(
  options?: LoadDashboardOptions
): Promise<DashboardSnapshot> {
  const supabase = await createClient();

  // 先 materialize — 之後的 transactions.select 才會吃到本月剛 placeholder 的
  // recurring 條目。失敗不擋（降級成「recurring 沒落地」的舊行為）。
  try {
    await supabase.rpc("materialize_due_recurrings");
  } catch {
    // RPC 不可用 / 未跑 0015 migration → 安靜降級
  }

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

  // 配 0032 索引 (user_id, date DESC)：帶 date 下界時走 index range scan，
  // 不再全表 sequential scan。
  const transactionsQuery = options?.transactionsSince
    ? supabase
        .from("transactions")
        .select("*")
        .gte("date", options.transactionsSince)
    : supabase.from("transactions").select("*");

  const [user, assets, debts, recurring, transactions, accounts] =
    await Promise.all([
      userPromise,
      safeList<AssetRow>(supabase.from("assets").select("*")),
      safeList<DebtRow>(supabase.from("debts").select("*")),
      safeList<RecurringRow>(supabase.from("recurring_payments").select("*")),
      safeList<TransactionRow>(transactionsQuery),
      safeList<AccountRow>(supabase.from("accounts").select("*")),
    ]);

  return { user, assets, debts, recurring, transactions, accounts };
}
