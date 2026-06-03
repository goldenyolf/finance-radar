"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ExpenseCategory } from "@/lib/expense-categories";

export type SeedResult =
  | { ok: true; inserted: { transactions: number; snapshots: number } }
  | { ok: false; error: string };

/**
 * Demo 資料種子 — 為當前登入用戶注入 6 個月「漂亮的」展示資料。
 *
 * 安全閘（雙閥）：
 *   1) Server 端：NODE_ENV='development' 或 NEXT_PUBLIC_ENABLE_DEMO_SEED='true'
 *      二擇一才放行。Production 預設拒絕，要 enable 必須顯式設環境變數。
 *   2) Client 端 SeedDemoButton 同條件決定要不要 render 按鈕（雙保險）。
 *
 * 資料策略：
 *   - 所有交易 description 前綴 "[DEMO]"，使用者要清乾淨可在 /transactions
 *     搜尋 "[DEMO]" 後逐筆刪除（或在 SQL Editor 跑 DELETE WHERE description
 *     LIKE '[DEMO]%'）。
 *   - wealth_snapshots 有 UNIQUE (user_id, recorded_at) → 用 upsert。
 *     重複點按鈕不會炸，會把已存在當月快照覆蓋成最新模擬值。
 *   - account_id 自動挑用戶第一個 'cash' 帳戶（per 0012 trigger 保證存在）；
 *     fallback 到第一個帳戶。
 *
 * RLS：authenticated client，user_id 走 DB DEFAULT auth.uid()，
 *      所有 insert 自動 scope 到當前用戶。
 */

const DEMO_PREFIX = "[DEMO]";

// 6 個月模板：每月固定 + 浮動支出組合，跨多個分類製造漂亮的圓餅圖
// 金額帶些變化（× random factor）避免每月一模一樣
interface DemoTxTemplate {
  description: string;
  amount: number;
  category: ExpenseCategory;
  /** 是否為固定支出（語意標示，不影響 DB；priority 統一給 essential/non_essential） */
  fixed: boolean;
  /** 該月內第幾天發生（1-28，避開 29-31 防月底踩雷） */
  day: number;
}

const MONTHLY_TX_TEMPLATES: DemoTxTemplate[] = [
  // 固定大額
  { description: "房貸", amount: 25000, category: "home_living", fixed: true, day: 5 },
  { description: "托育費", amount: 18000, category: "childcare_education", fixed: true, day: 10 },
  { description: "保險月繳", amount: 4500, category: "finance_insurance", fixed: true, day: 15 },
  // 浮動小額
  { description: "全聯採買", amount: 2800, category: "food_dining", fixed: false, day: 7 },
  { description: "外食午餐", amount: 1200, category: "food_dining", fixed: false, day: 12 },
  { description: "週末家庭聚餐", amount: 1800, category: "food_dining", fixed: false, day: 20 },
  { description: "加油", amount: 1500, category: "transport", fixed: false, day: 18 },
];

function jitter(amount: number, pct = 0.15): number {
  // ±pct 範圍隨機抖動，每月不會一模一樣
  const factor = 1 + (Math.random() - 0.5) * 2 * pct;
  return Math.round(amount * factor);
}

function monthStart(year: number, month: number): Date {
  // month 0-indexed
  return new Date(year, month, 1);
}

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Env gate 檢查。env 兩條任一為真即放行。
 * NEXT_PUBLIC_ 前綴讓 client 端也能讀，雙閥對齊。
 */
function isDemoSeedAllowed(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED === "true"
  );
}

export async function seedDemoData(): Promise<SeedResult> {
  if (!isDemoSeedAllowed()) {
    return {
      ok: false,
      error:
        "Demo 種子已關閉。要啟用請在環境變數設 NEXT_PUBLIC_ENABLE_DEMO_SEED=true 或在 development 模式下執行。",
    };
  }

  const supabase = await createClient();

  // 拿當前用戶（auth.uid()），同時挑一個適合的扣款帳戶
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, error: "未登入或 session 失效" };
  }
  const userId = userData.user.id;

  const { data: accounts, error: accErr } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("user_id", userId);
  if (accErr) return { ok: false, error: `撈帳戶失敗：${accErr.message}` };
  if (!accounts || accounts.length === 0) {
    return {
      ok: false,
      error:
        "尚未建立任何帳戶，請先到 /settings 或重新登入觸發 cash account auto-seed。",
    };
  }

  // 優先用現金錢包；沒有就第一個帳戶
  const cashAcc = accounts.find((a) => a.type === "cash");
  const targetAccountId = (cashAcc ?? accounts[0]).id as string;

  // 生成 6 個月 transactions（包含本月）
  const now = new Date();
  const txRows: Array<{
    user_id: string;
    account_id: string;
    description: string;
    amount: number;
    type: "expense";
    priority: "essential" | "non_essential";
    category: ExpenseCategory;
    payment_method: "cash" | "credit_card" | "transfer";
    status: "completed";
    date: string;
  }> = [];

  for (let offset = 5; offset >= 0; offset--) {
    const targetMonth = monthStart(
      now.getFullYear(),
      now.getMonth() - offset
    );
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();

    for (const tpl of MONTHLY_TX_TEMPLATES) {
      const txDate = new Date(year, month, tpl.day);
      // 別讓未來日期跑出來（本月模板的 day 可能 > 今天）
      if (txDate > now) continue;
      txRows.push({
        user_id: userId,
        account_id: targetAccountId,
        description: `${DEMO_PREFIX} ${tpl.description}`,
        amount: tpl.fixed ? tpl.amount : jitter(tpl.amount),
        type: "expense",
        priority: tpl.fixed ? "essential" : "non_essential",
        category: tpl.category,
        // 固定大額（房貸/托育/保險）習慣走銀行轉帳；浮動走現金/刷卡輪換
        payment_method: tpl.fixed
          ? "transfer"
          : tpl.day % 2 === 0
            ? "credit_card"
            : "cash",
        status: "completed",
        date: toIsoDate(txDate),
      });
    }
  }

  const { error: txInsertErr } = await supabase
    .from("transactions")
    .insert(txRows);
  if (txInsertErr) {
    return { ok: false, error: `寫入交易失敗：${txInsertErr.message}` };
  }

  // 生成 6 個月 wealth_snapshots — 100 萬 → 125 萬線性爬升 + 小幅抖動
  // 每月一筆記在月底；本月的記在「今天」(避開 31 號月份問題)
  const snapshotRows: Array<{
    user_id: string;
    recorded_at: string;
    total_assets: number;
    total_liabilities: number;
    details: Record<string, unknown>[];
  }> = [];

  for (let offset = 5; offset >= 0; offset--) {
    const targetMonth = monthStart(
      now.getFullYear(),
      now.getMonth() - offset
    );
    // 月底：下個月 1 號 - 1 天
    const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
    const recordedAt = monthEnd > now ? now : monthEnd;
    const baseAssets = 1_000_000 + (5 - offset) * 50_000;
    const assets = baseAssets + jitter(20_000, 0.3);
    const liabilities = 0; // 簡化：示範資料不帶負債
    snapshotRows.push({
      user_id: userId,
      recorded_at: toIsoDate(recordedAt),
      total_assets: assets,
      total_liabilities: liabilities,
      details: [
        { name: "活存現金", type: "asset", value: Math.round(assets * 0.3) },
        { name: "投資部位", type: "asset", value: Math.round(assets * 0.5) },
        { name: "備用金", type: "asset", value: Math.round(assets * 0.2) },
      ],
    });
  }

  // UPSERT 處理 unique (user_id, recorded_at) 衝突 — 重複點按鈕不會炸
  const { error: snapErr } = await supabase
    .from("wealth_snapshots")
    .upsert(snapshotRows, { onConflict: "user_id,recorded_at" });
  if (snapErr) {
    return { ok: false, error: `寫入資產快照失敗：${snapErr.message}` };
  }

  // 觸發相關頁面 revalidate — 首頁 / 分析 / 淨資產都吃 transactions + snapshots
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/net-worth");
  revalidatePath("/transactions");

  return {
    ok: true,
    inserted: {
      transactions: txRows.length,
      snapshots: snapshotRows.length,
    },
  };
}

/*
 * 注意：「按鈕該不該顯示」的客端判定不放這裡（"use server" 檔案不允許
 * 非 async function 的 export），SeedDemoButton 自行內聯同一條件即可。
 */
