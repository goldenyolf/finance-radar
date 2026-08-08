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

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatCurrency } from "@/lib/dashboard";
import {
  sendLineFlexNotification,
  type FlexBubble,
} from "@/lib/line-push";

/**
 * server action 的 authenticated client（@supabase/ssr）與 webhook / cron 的
 * service role client（@supabase/supabase-js）都是 SupabaseClient，直接用官方
 * 型別即可。
 *
 * 這裡原本手寫了一份 SupabaseLike 結構型別，導致每個查詢都得寫
 * `as unknown as { eq: ... }` 把 builder 的下一段接回來 —— 大約 40 行的
 * cast 體操，而且完全沒有型別安全（打錯欄位名不會被抓到）。
 */
type Db = SupabaseClient;

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
  supabase: Db,
  userId: string
): Promise<void> {
  try {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!channelAccessToken) return; // LINE 沒設定 → 靜默 skip

    const ctx = await collectContext(supabase, userId);
    if (!ctx) return;

    // Scenario A：本月剩餘率跌破 20%
    //   遊戲規則：必須 monthlyBudget > 0 才有「剩餘率」概念；
    //   remainingPct 為負（已透支）也算命中（更該警報）。
    if (ctx.monthlyBudget > 0 && ctx.remainingPct < 20) {
      await fireIfFirst(
        supabase,
        userId,
        ctx.lineUserId,
        "low_remaining",
        ctx.monthPeriod,
        {
          remaining: ctx.monthlyRemaining,
          remaining_pct: ctx.remainingPct,
        },
        () => buildLowRemainingFlex(ctx)
      );
    }

    // Scenario B：單日熔斷（今日支出 >= 每日基準 × 5）
    //   dailyBaseline=0（沒設預算）→ 永不觸發，避免「無預算還說熔斷」。
    if (
      ctx.dailyBaseline > 0 &&
      ctx.todaySpent >= ctx.dailyBaseline * 5
    ) {
      await fireIfFirst(
        supabase,
        userId,
        ctx.lineUserId,
        "daily_burst",
        ctx.todayPeriod,
        {
          today_spent: ctx.todaySpent,
          multiplier: ctx.todaySpent / ctx.dailyBaseline,
        },
        () => buildDailyBurstFlex(ctx)
      );
    }
  } catch (err) {
    console.error("[budget-alerts] runBudgetAlerts unexpected:", err);
    // 安靜降級 — 永不拋給 caller
  }
}

/* ─────────────────── Context 收集 ─────────────────── */

async function collectContext(
  supabase: Db,
  userId: string
): Promise<AlertContext | null> {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

  // (1) profile.line_user_id — 沒綁不推
  const profileRes = await supabase
    .from("profiles")
    .select("line_user_id")
    .eq("user_id", userId)
    .maybeSingle();
  const profile = profileRes.data as ProfileRow | null;
  if (profileRes.error || !profile?.line_user_id) return null;
  const lineUserId = profile.line_user_id;

  // (2) 本月區間
  const now = new Date();
  const monthPeriod = ymdMonth(now);
  const monthStart = `${monthPeriod}-01`;
  const nextMonthStart = computeNextMonthStart(monthStart);
  const todayPeriod = ymdDate(now);

  // (3) 本月 expense + completed 交易 / (4) 本人 expense 類 categories
  //     兩者無依賴關係，併行跑省一次 round-trip。
  const [txRes, catRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount, date, category")
      .eq("user_id", userId)
      .eq("type", "expense")
      .eq("status", "completed")
      .gte("date", monthStart)
      .lt("date", nextMonthStart),
    supabase
      .from("categories")
      .select("code, name, budget_monthly, type")
      .eq("user_id", userId)
      .eq("type", "expense"),
  ]);

  if (txRes.error || catRes.error) return null;
  const transactions = (txRes.data ?? []) as ExpenseTxRow[];
  const categories = (catRes.data ?? []) as CategoryRow[];

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
 * 先 INSERT budget_alerts 佔位（UNIQUE 約束擋掉併發的第二次），成功才推
 * LINE Flex。23505 (unique violation) = 此 period 已推過、靜默 skip。
 *
 * **推播失敗要把佔位列刪掉**：舊版只 console.error 就結束，但去重列已經寫
 * 進去了 —— LINE token 過期 / 429 / 網路抖一下，該使用者這個月的
 * low_remaining 警報就再也不會發，而且完全無聲。撤回之後下一筆交易觸發
 * runBudgetAlerts 時會重試。
 *
 * 為什麼不乾脆「先推再寫」：那樣併發兩條 runBudgetAlerts（例如 LINE 記帳
 * 同時網頁也在改交易）會各自推一次，使用者收到重複警報。先佔位仍然是對的
 * 順序，只是失敗要收乾淨。
 *
 * composeFlex 回傳 {altText, contents}：altText 是純文字 fallback（LINE
 * 通知列 / Apple Watch / 舊客戶端顯示）、contents 是 bubble JSON。
 */
async function fireIfFirst(
  supabase: Db,
  userId: string,
  lineUserId: string,
  alertType: "low_remaining" | "daily_burst",
  alertPeriod: string,
  payload: Record<string, unknown>,
  composeFlex: () => { altText: string; contents: FlexBubble }
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

  // 首度觸發 → Flex Message push。lineUserId 由 collectContext 帶進來，
  // 不再為了拿它多打一次 profiles。
  const { altText, contents } = composeFlex();
  const ok = await sendLineFlexNotification({
    userId: lineUserId,
    altText,
    contents,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
  });
  if (ok) return;

  console.error(
    `[budget-alerts] LINE flex push failed for ${alertType} ${alertPeriod}，撤回去重列以便重試`
  );
  const { error: rollbackErr } = await supabase
    .from("budget_alerts")
    .delete()
    .eq("user_id", userId)
    .eq("alert_type", alertType)
    .eq("alert_period", alertPeriod);
  if (rollbackErr) {
    // 撤回也失敗 → 這個 period 確實會消音。至少讓它在 log 裡是刺眼的，
    // 而不是像舊版那樣完全沒有痕跡。
    console.error(
      `[budget-alerts] 撤回去重列失敗，${alertType} ${alertPeriod} 將不再重試:`,
      rollbackErr
    );
  }
}

/* ─────────────────── Flex Message 組裝 ─────────────────── */

/**
 * Apple 暗黑奢華調色板 — 一處宣告，bubble 內所有顏色從這吃。
 */
const FLEX_COLORS = {
  bg: "#09090b",            // zinc-950 — bubble 整體底
  bgSubtle: "#27272a",      // zinc-800 — 進度條外殼底色
  textPrimary: "#ffffff",   // hero 大字
  textSecondary: "#a1a1aa", // zinc-400 — 標題 / footer
  textTertiary: "#71717a",  // zinc-500 — subtitle / hint
  alertRed: "#ef4444",      // red-500 — 進度條警戒色 / 狀態燈危險
  emerald: "#10b981",       // emerald-500 — 進度條安全色 / 按鈕 / 狀態燈
  amber: "#f59e0b",         // amber-500 — 警告中間值
} as const;

/**
 * 戰情室 web URL — 按鈕跳轉用。LINE button uri 必須絕對路徑。
 * Fork repo 沒設 → 退回不渲染按鈕的版本（buildFooter 自動處理）。
 */
function getSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, ""); // 統一去掉結尾斜線
}

/**
 * 場景 A：活錢告急 — 月度剩餘率 < 20%。
 *
 * Bubble 結構：
 *   header: 📡 戰情預警 + 紅色狀態燈
 *   body:   「剩餘可用活錢」標籤 + $ 大字 + 預算佔比副標 + 動態進度條
 *   footer: 主要破口分類描述 + 「開啟戰情室」按鈕
 */
function buildLowRemainingFlex(ctx: AlertContext): {
  altText: string;
  contents: FlexBubble;
} {
  const topCat = topExpenseCategory(ctx.transactions, ctx.categories);
  const advisorText = topCat
    ? `⚠️ 本月預算即將熔斷，主要破口為「${topCat.name}」(${formatCurrency(topCat.amount)})。`
    : "⚠️ 本月預算即將熔斷，請即刻收斂浮動開銷。";

  // 進度條：剩餘率對應寬度，clamp 至 [2%, 100%]（< 2% 看不見、避免破版）
  const barPct = Math.max(2, Math.min(100, ctx.remainingPct));
  const barColor =
    ctx.remainingPct < 20 ? FLEX_COLORS.alertRed : FLEX_COLORS.emerald;

  const altText = `🚨 活錢預警！剩餘 ${formatCurrency(ctx.monthlyRemaining)}（${ctx.remainingPct.toFixed(1)}%）— ${topCat?.name ?? "整體"} 為主要破口`;

  const contents: FlexBubble = {
    type: "bubble",
    size: "kilo",
    styles: {
      header: { backgroundColor: FLEX_COLORS.bg },
      body: { backgroundColor: FLEX_COLORS.bg },
      footer: { backgroundColor: FLEX_COLORS.bg },
    },
    header: buildHeader("alert"),
    body: buildBody({
      label: "剩餘可用活錢",
      heroAmount: ctx.monthlyRemaining,
      subtitle: `本月總預算 ${formatCurrency(ctx.monthlyBudget)} 的 ${ctx.remainingPct.toFixed(1)}%`,
      progressPct: barPct,
      progressColor: barColor,
    }),
    footer: buildFooter({
      advisor: advisorText,
      buttonLabel: "🛡️ 開啟戰情室",
      buttonTone: "alert",
    }),
  };

  return { altText, contents };
}

/**
 * 場景 B：單日熔斷 — 今日支出 ≥ 每日基準 × 5。
 */
function buildDailyBurstFlex(ctx: AlertContext): {
  altText: string;
  contents: FlexBubble;
} {
  const multiplier = ctx.todaySpent / ctx.dailyBaseline;
  const advisorText = `🔥 今日已達基準的 ${multiplier.toFixed(1)} 倍，請確認是否為單次大額預付。`;

  // 進度條：「今日支出佔基準的倍率」，超過 100% 全紅滿；clamp [2%, 100%]
  const barPct = Math.max(2, Math.min(100, (1 / multiplier) * 100));

  const altText = `🔥 單日熔斷！今日 ${formatCurrency(ctx.todaySpent)}（${multiplier.toFixed(1)}× 基準）`;

  const contents: FlexBubble = {
    type: "bubble",
    size: "kilo",
    styles: {
      header: { backgroundColor: FLEX_COLORS.bg },
      body: { backgroundColor: FLEX_COLORS.bg },
      footer: { backgroundColor: FLEX_COLORS.bg },
    },
    header: buildHeader("alert"),
    body: buildBody({
      label: "今日已花費",
      heroAmount: ctx.todaySpent,
      subtitle: `每日基準預算 ${formatCurrency(ctx.dailyBaseline)} 的 ${multiplier.toFixed(1)} 倍`,
      progressPct: barPct,
      progressColor: FLEX_COLORS.alertRed, // 單日熔斷一律紅
    }),
    footer: buildFooter({
      advisor: advisorText,
      buttonLabel: "💡 啟動智慧攤平",
      buttonTone: "alert",
    }),
  };

  return { altText, contents };
}

/* ─────────────────── Flex 子元件 builder ─────────────────── */

function buildHeader(status: "safe" | "alert"): FlexBubble {
  const dotColor =
    status === "alert" ? FLEX_COLORS.alertRed : FLEX_COLORS.emerald;
  return {
    type: "box",
    layout: "horizontal",
    paddingAll: "16px",
    paddingBottom: "8px",
    contents: [
      {
        type: "text",
        text: "📡 MONEY RADAR 戰情預警",
        size: "xs",
        weight: "bold",
        color: FLEX_COLORS.textSecondary,
        flex: 1,
      },
      // 狀態燈圓點 — 用「●」文字 + 顏色，省 image asset
      {
        type: "text",
        text: "●",
        size: "xs",
        color: dotColor,
        align: "end",
        flex: 0,
      },
    ],
  };
}

interface BodyArgs {
  label: string;
  heroAmount: number;
  subtitle: string;
  progressPct: number;
  progressColor: string;
}

function buildBody({
  label,
  heroAmount,
  subtitle,
  progressPct,
  progressColor,
}: BodyArgs): FlexBubble {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "20px",
    paddingTop: "4px",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: label,
        size: "xs",
        color: FLEX_COLORS.textTertiary,
      },
      {
        type: "text",
        text: formatCurrency(heroAmount),
        size: "3xl",
        weight: "bold",
        color: FLEX_COLORS.textPrimary,
      },
      {
        type: "text",
        text: subtitle,
        size: "xxs",
        color: FLEX_COLORS.textTertiary,
        margin: "sm",
      },
      // 進度條：外殼 horizontal box（bg-subtle + rounded + 6px 高），
      // 內層 width % 控制 fill 比例 + 染色
      {
        type: "box",
        layout: "horizontal",
        margin: "md",
        height: "6px",
        backgroundColor: FLEX_COLORS.bgSubtle,
        cornerRadius: "3px",
        contents: [
          {
            type: "box",
            layout: "vertical",
            width: `${progressPct.toFixed(1)}%`,
            backgroundColor: progressColor,
            cornerRadius: "3px",
            contents: [
              // 空 box — LINE 需要至少一個 content；用透明 text 填位
              {
                type: "filler",
              },
            ],
          },
        ],
      },
    ],
  };
}

interface FooterArgs {
  advisor: string;
  buttonLabel: string;
  buttonTone: "alert" | "safe";
}

function buildFooter({
  advisor,
  buttonLabel,
  buttonTone,
}: FooterArgs): FlexBubble {
  const siteUrl = getSiteUrl();
  const buttonColor =
    buttonTone === "alert" ? FLEX_COLORS.alertRed : FLEX_COLORS.emerald;

  const contents: FlexBubble[] = [
    {
      type: "separator",
      color: FLEX_COLORS.bgSubtle,
    },
    {
      type: "text",
      text: advisor,
      size: "xs",
      color: FLEX_COLORS.textSecondary,
      wrap: true,
      margin: "md",
    },
  ];

  // 沒設 NEXT_PUBLIC_SITE_URL → 不渲染按鈕（fork dev 環境保護）
  if (siteUrl) {
    contents.push({
      type: "button",
      style: "primary",
      color: buttonColor,
      height: "sm",
      margin: "lg",
      action: {
        type: "uri",
        label: buttonLabel,
        uri: `${siteUrl}/analytics`,
      },
    });
  }

  return {
    type: "box",
    layout: "vertical",
    paddingAll: "16px",
    paddingTop: "0px",
    contents,
  };
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
