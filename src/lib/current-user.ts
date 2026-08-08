import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * 取當前登入者的 uid，未登入回 null。
 *
 * 為什麼包 React `cache()`：首頁一次平行跑 10 個 loader，每個 loader 都要
 * uid 才能做 `.eq("user_id", uid)`。沒有記憶化的話 = 10 次 auth server
 * round-trip。`cache()` 在單一 RSC render pass（或單一 server action 呼叫）
 * 內去重，實際只打一次。
 *
 * 為什麼不用 getSession()：@supabase/ssr 的 getSession 只解 cookie 不驗簽，
 * cookie 可被竄改。getUser() 會跟 auth server 驗證，這裡拿到的 uid 會直接
 * 當成資料隔離的依據，必須是驗過的。
 *
 * 為什麼需要它（而不是全靠 RLS）：本 repo 的 migrations 只對 6 張表開過
 * RLS（0004 wealth / 0007 plates / 0010 profiles / 0016 budget_alerts /
 * 0024 accounts / 0028 transactions）。users / assets / debts /
 * recurring_payments / categories / goals / subscriptions / system_settings
 * 都沒有，這些表上的無條件 select 等於跨租戶讀取。
 */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
});
