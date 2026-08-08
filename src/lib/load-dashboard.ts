import { getCurrentUserId } from "@/lib/current-user";
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

  // materialize 要在 transactions.select 之前完成，select 才吃得到本月剛
  // placeholder 的 recurring 條目 —— 但它跟 getUser() 彼此無關，兩者並行跑，
  // 省掉一次序列 round-trip。RPC 失敗不擋（降級成「recurring 沒落地」的舊行為）。
  const [, uid] = await Promise.all([
    supabase.rpc("materialize_due_recurrings").then(
      () => null,
      () => null // RPC 不可用 / 未跑 0015 migration → 安靜降級
    ),
    getCurrentUserId(),
  ]);

  // 未登入（session 過期 / RSC 在 proxy 放行的路徑上跑）→ 回空快照。
  // 沒有 uid 就不該對任何表做無條件全表 select。
  if (!uid) {
    return {
      user: null,
      assets: [],
      debts: [],
      recurring: [],
      transactions: [],
      accounts: [],
    };
  }

  // 每張表都顯式 .eq("user_id", uid)。RLS 是主要防線，但 users / assets /
  // debts / recurring_payments 這幾張表在 repo 的 migrations 裡從沒 ENABLE
  // ROW LEVEL SECURITY 過（只有 0004/0007/0010/0016/0024/0028 六張有），
  // 而 users 原本是 `.select("*").limit(1)` 完全無條件 —— RLS 若沒開，
  // 拿到的是「表裡第一筆」= 別人的 emergency_fund_threshold，會直接流進
  // 首頁的安全門檻與現金流預測。
  const userPromise = (async () => {
    try {
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("id", uid)
        .maybeSingle();
      return data as UserRow | null;
    } catch {
      return null;
    }
  })();

  // 配 0032 索引 (user_id, date DESC)：帶 date 下界時走 index range scan，
  // 不再全表 sequential scan。
  let transactionsQuery = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", uid);
  if (options?.transactionsSince) {
    transactionsQuery = transactionsQuery.gte(
      "date",
      options.transactionsSince
    );
  }

  const [user, assets, debts, recurring, transactions, accounts] =
    await Promise.all([
      userPromise,
      safeList<AssetRow>(
        supabase.from("assets").select("*").eq("user_id", uid)
      ),
      safeList<DebtRow>(supabase.from("debts").select("*").eq("user_id", uid)),
      safeList<RecurringRow>(
        supabase.from("recurring_payments").select("*").eq("user_id", uid)
      ),
      safeList<TransactionRow>(transactionsQuery),
      safeList<AccountRow>(
        supabase.from("accounts").select("*").eq("user_id", uid)
      ),
    ]);

  return { user, assets, debts, recurring, transactions, accounts };
}
