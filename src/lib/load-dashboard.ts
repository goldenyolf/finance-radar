import { getCurrentUserId } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import type {
  AccountRow,
  AssetRow,
  DebtRow,
  RecurringRow,
  TransactionRow,
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
      assets: [],
      debts: [],
      recurring: [],
      transactions: [],
      accounts: [],
    };
  }

  // 每張表都顯式 .eq("user_id", uid) — belt-and-suspenders。0036 之後所有表
  // 的 RLS 都補齊了（實測 anon 讀不到任何一張），但 RLS 是「當下狀態」不是
  // 「不變量」：0028 明明對 transactions 開過 RLS，卻被一條遺留的 anon 全開
  // policy 蓋掉，實測 anon 讀得到全部 312 列。程式碼層的 filter 不會被 DB
  // 端的設定漂移悄悄關掉，值得留著。
  //
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

  const [assets, debts, recurring, transactions, accounts] =
    await Promise.all([
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

  return { assets, debts, recurring, transactions, accounts };
}
