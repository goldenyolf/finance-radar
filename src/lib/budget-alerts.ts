/**
 * 預算門檻監控 + LINE 主動警報。
 *
 * 觸發時機（caller 端決定）：
 *   - actions/transactions.ts: create / update transaction 成功後
 *   - line webhook: expense INSERT / placeholder confirm 成功後
 *
 * 兩種警報（per spec）：
 *   A. low_remaining: 本月剩餘額度率 < 20% → 月度活錢預警
 *   B. daily_burst:   今日支出 ≥ 每日基準預算 × 5 → 單日熔斷警告
 *
 * 去重：INSERT 到 budget_alerts 表，UNIQUE (user_id, alert_type, alert_period)
 * 衝突 = 此 period 已警報 / skip 推送。月度警報 period='YYYY-MM'、單日警報
 * period='YYYY-MM-DD'，自然按時間維度去重。
 *
 * 設計信念：警報失敗**不該**炸主流程。所有錯誤都吞掉只 log。
 */

import { formatCurrency } from "@/lib/dashboard";
import { sendLinePushNotification } from "@/lib/line-push";

/**
 * 寬鬆 Supabase client 型別 — 接受 server action 的 authenticated client、
 * 也接受 webhook 的 service role client。共用 .from().select/.insert 介面。
 */
type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        eq?: (col: string, val: unknown) => {
          maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
        };
        gte?: (col: string, val: string) => {
          lt: (col: string, val: string) => Promise<{ data: unknown; error: unknown }>;
        };
        maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
    insert: (
      values: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  };
};

interface ExpenseTxRow {
  amount: number | string;
  date: string;
  category: string | null;
}

interface CategoryRow {
  code: string | null;
  name: string;
  budget_monthly: number;
  type: string;
}

interface ProfileRow {
  line_user_id: string | null;
}

interface AlertContext {
  channelAccessToken: string;
  lineUserId: string;
  monthlyBudget: number;
  monthlyRemaining: number;
  remainingPct: number;
  todaySpent: number;
  dailyBaseline: number;
  monthPeriod: string; // 'YYYY-MM'
  todayPeriod: string; // 'YYYY-MM-DD'
  transactions: ExpenseTxRow[];
  categories: CategoryRow[];
}

/**
 * 主入口。caller pass 帶 user_id（authenticated client 雖有 RLS 自動 scope
 * 但 service role client 沒有，顯式傳穩定）。
 */
export async function runBudgetAlerts(
  supabase: unknown,
  userId: string
): Promise<void> {
  try {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!channelAccessToken) return; // LINE 沒設定 → 靜默 skip

    const ctx = await collectContext(supabase as SupabaseLike, userId);
    if (!ctx) return;

    // Scenario A：本月剩餘率跌破 20%
    //   遊戲規則：必須 monthlyBudget > 0 才有「剩餘率」概念；
    //   remainingPct 為負（已透支）也算命中（更該警報）。
    if (ctx.monthlyBudget > 0 && ctx.remainingPct < 20) {
      await fireIfFirst(
        supabase as SupabaseLike,
        userId,
        "low_remaining",
        ctx.monthPeriod,
        {
          remaining: ctx.monthlyRemaining,
          remaining_pct: ctx.remainingPct,
        },
        () => composeLowRemainingMessage(ctx)
      );
    }

    // Scenario B：單日熔斷（今日支出 >= 每日基準 × 5）
    //   dailyBaseline=0（沒設預算）→ 永不觸發，避免「無預算還說熔斷」。
    if (
      ctx.dailyBaseline > 0 &&
      ctx.todaySpent >= ctx.dailyBaseline * 5
    ) {
      await fireIfFirst(
        supabase as SupabaseLike,
        userId,
        "daily_burst",
        ctx.todayPeriod,
        {
          today_spent: ctx.todaySpent,
          multiplier: ctx.todaySpent / ctx.dailyBaseline,
        },
        () => composeDailyBurstMessage(ctx)
      );
    }
  } catch (err) {
    console.error("[budget-alerts] runBudgetAlerts unexpected:", err);
    // 安靜降級 — 永不拋給 caller
  }
}

/* ─────────────────── Context 收集 ─────────────────── */

async function collectContext(
  supabase: SupabaseLike,
  userId: string
): Promise<AlertContext | null> {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

  // (1) profile.line_user_id — 沒綁不推
  const profileQuery = supabase
    .from("profiles")
    .select("line_user_id")
    .eq("user_id", userId);
  const profileRes = await (
    profileQuery as unknown as {
      maybeSingle: () => Promise<{ data: ProfileRow | null; error: unknown }>;
    }
  ).maybeSingle();
  if (profileRes.error || !profileRes.data?.line_user_id) return null;
  const lineUserId = profileRes.data.line_user_id;

  // (2) 本月區間
  const now = new Date();
  const monthPeriod = ymdMonth(now);
  const monthStart = `${monthPeriod}-01`;
  const nextMonthStart = computeNextMonthStart(monthStart);
  const todayPeriod = ymdDate(now);

  // (3) 本月 expense + completed 交易
  const txQuery = supabase
    .from("transactions")
    .select("amount, date, category")
    .eq("user_id", userId);
  const txQuery2 = (
    txQuery as unknown as {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => {
          gte: (col: string, val: string) => {
            lt: (col: string, val: string) => Promise<{
              data: ExpenseTxRow[] | null;
              error: unknown;
            }>;
          };
        };
      };
    }
  )
    .eq("type", "expense")
    .eq("status", "completed")
    .gte("date", monthStart)
    .lt("date", nextMonthStart);
  const txRes = await txQuery2;
  if (txRes.error) return null;
  const transactions = txRes.data ?? [];

  // (4) 本人 expense 類 categories
  const catQuery = supabase
    .from("categories")
    .select("code, name, budget_monthly, type")
    .eq("user_id", userId);
  const catRes = (await (
    catQuery as unknown as {
      eq: (col: string, val: unknown) => Promise<{
        data: CategoryRow[] | null;
        error: unknown;
      }>;
    }
  ).eq("type", "expense")) as {
    data: CategoryRow[] | null;
    error: unknown;
  };
  if (catRes.error) return null;
  const categories = catRes.data ?? [];

  // (5) 計算 metrics
  const monthlyBudget = categories.reduce(
    (s, c) => s + (Number(c.budget_monthly) || 0),
    0
  );
  const monthlySpent = transactions.reduce(
    (s, t) => s + (Number(t.amount) || 0),
    0
  );
  const monthlyRemaining = monthlyBudget - monthlySpent;
  const remainingPct =
    monthlyBudget > 0 ? (monthlyRemaining / monthlyBudget) * 100 : 100;

  const todaySpent = transactions
    .filter((t) => t.date === todayPeriod)
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();
  const dailyBaseline = monthlyBudget / daysInMonth;

  return {
    channelAccessToken,
    lineUserId,
    monthlyBudget,
    monthlyRemaining,
    remainingPct,
    todaySpent,
    dailyBaseline,
    monthPeriod,
    todayPeriod,
    transactions,
    categories,
  };
}

/* ─────────────────── 警報 fire + 去重 ─────────────────── */

/**
 * 嘗試 INSERT budget_alerts；成功（首度觸發）才呼 LINE push。
 * 23505 (unique violation) = 此 period 已推過、靜默 skip。
 */
async function fireIfFirst(
  supabase: SupabaseLike,
  userId: string,
  alertType: "low_remaining" | "daily_burst",
  alertPeriod: string,
  payload: Record<string, unknown>,
  composeMessage: () => string
): Promise<void> {
  const insertRes = await supabase.from("budget_alerts").insert({
    user_id: userId,
    alert_type: alertType,
    alert_period: alertPeriod,
    payload,
  });

  if (insertRes.error) {
    // 23505 = 已存在 = 此 period 已警報過、預期內結果
    if (insertRes.error.code === "23505") return;
    console.error(
      `[budget-alerts] insert ${alertType} failed:`,
      insertRes.error
    );
    return;
  }

  // 首度觸發 → push
  const text = composeMessage();
  const ok = await sendLinePushNotification({
    userId: (await getLineUserId(supabase, userId)) ?? "",
    text,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
  });
  if (!ok) {
    console.error(
      `[budget-alerts] LINE push failed for ${alertType} ${alertPeriod}`
    );
  }
}

/* 共用：拿 line_user_id（fireIfFirst 內部用） */
async function getLineUserId(
  supabase: SupabaseLike,
  userId: string
): Promise<string | null> {
  const q = supabase.from("profiles").select("line_user_id").eq("user_id", userId);
  const res = await (
    q as unknown as {
      maybeSingle: () => Promise<{
        data: { line_user_id: string | null } | null;
        error: unknown;
      }>;
    }
  ).maybeSingle();
  return res.data?.line_user_id ?? null;
}

/* ─────────────────── 文案組裝 ─────────────────── */

function composeLowRemainingMessage(ctx: AlertContext): string {
  const topCat = topExpenseCategory(ctx.transactions, ctx.categories);
  const topCatLine = topCat
    ? `吸血鬼排行顯示本月主要破口為「${topCat.name}」（${formatCurrency(topCat.amount)}）。`
    : "本月支出尚未明顯集中於某分類，注意整體節奏。";
  return [
    "🚨 Money Radar 活錢預警！",
    "",
    `本月剩餘可用預算已跌破 20% 安全線（僅剩 ${formatCurrency(ctx.monthlyRemaining)}）。`,
    topCatLine,
    "",
    "🛡️ 戰情室建議您接下來 7 天切換至極簡生活模式。",
  ].join("\n");
}

function composeDailyBurstMessage(ctx: AlertContext): string {
  const multiplier = ctx.todaySpent / ctx.dailyBaseline;
  return [
    "🔥 錢包熔斷警告！",
    "",
    `今日單日開銷已達每日基準預算的 ${multiplier.toFixed(1)} 倍（今日已花費 ${formatCurrency(ctx.todaySpent)}）。`,
    "",
    "💡 請確認是否為單次大額預付，或前往網頁戰情室啟動「智慧攤平」機制。",
  ].join("\n");
}

/**
 * 算當月支出最高的 expense 分類，給 low_remaining 文案點名「主要破口」。
 * categories 沒命中時 fallback 用 code 字串。
 */
function topExpenseCategory(
  transactions: ExpenseTxRow[],
  categories: CategoryRow[]
): { name: string; amount: number } | null {
  const sums = new Map<string, number>();
  for (const t of transactions) {
    const code = t.category ?? "other";
    sums.set(code, (sums.get(code) ?? 0) + (Number(t.amount) || 0));
  }
  let top: { code: string; amount: number } | null = null;
  for (const [code, amount] of sums) {
    if (!top || amount > top.amount) top = { code, amount };
  }
  if (!top) return null;
  const cat = categories.find((c) => c.code === top!.code);
  return {
    name: cat?.name ?? FALLBACK_CATEGORY_LABEL[top.code] ?? top.code,
    amount: top.amount,
  };
}

const FALLBACK_CATEGORY_LABEL: Record<string, string> = {
  food_dining: "餐飲食品",
  childcare_education: "育兒教育",
  eldercare: "孝親",
  home_living: "居家生活",
  finance_insurance: "金融保險",
  transport: "交通出行",
  other: "其他",
};

/* ─────────────────── 日期工具 ─────────────────── */

function ymdMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ymdDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeNextMonthStart(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  if (!y || !m) return monthStart;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}
