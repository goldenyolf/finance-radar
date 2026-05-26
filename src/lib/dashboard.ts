// ─── Domain types ────────────────────────────────────

export type AssetType =
  | "cash"
  | "savings"
  | "stock"
  | "fund"
  | "crypto"
  | "real_estate"
  | "other";

export type DebtType =
  | "mortgage"
  | "personal_loan"
  | "credit_card"
  | "student_loan"
  | "car_loan"
  | "other";

export type AccountType = "bank" | "credit_card";

export type TransactionTypeAll = "income" | "expense" | "transfer";
export type TransactionStatus = "completed" | "upcoming";
/** 重要度標籤（前身為 TransactionCategory）。沿用 essential/non_essential 兩值。 */
export type TransactionPriority = "essential" | "non_essential";
export type TransferDirection = "out" | "in";

/** 花費大類（snake_case，對應 DB CHECK constraint，前端顯示走 label map）。 */
export type ExpenseCategory =
  | "food_dining"
  | "childcare_education"
  | "eldercare"
  | "home_living"
  | "finance_insurance"
  | "transport"
  | "other";

export type RecurringType = "income" | "expense";
export type RecurringFrequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semi_annually"
  | "yearly";

export type RiskLevel = "low" | "medium" | "high";

export interface UserRow {
  id: string;
  name: string | null;
  emergency_fund_threshold: number | string;
}

export interface AssetRow {
  id: string;
  user_id: string;
  type: AssetType;
  name: string;
  current_value: number | string;
}

export interface DebtRow {
  id: string;
  user_id: string;
  type: DebtType;
  name: string;
  balance: number | string;
}

export interface AccountRow {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  balance: number | string;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  account_id: string | null;
  description: string | null;
  amount: number | string;
  type: TransactionTypeAll;
  priority: TransactionPriority | null;
  category: ExpenseCategory | null;
  status: TransactionStatus;
  date: string;
  transfer_group_id?: string | null;
  transfer_direction?: TransferDirection | null;
}

export interface RecurringRow {
  id: string;
  user_id: string;
  account_id: string | null;
  title: string;
  amount: number | string;
  type: RecurringType;
  frequency: RecurringFrequency;
  next_due_date: string;
}

// ─── Helpers ─────────────────────────────────────────

export const num = (v: number | string | null | undefined) =>
  typeof v === "number" ? v : Number.parseFloat(v ?? "0") || 0;

const MONTHLY_FACTOR: Record<RecurringFrequency, number> = {
  daily: 30,
  weekly: 4,
  biweekly: 2,
  monthly: 1,
  quarterly: 1 / 3,
  semi_annually: 1 / 6,
  yearly: 1 / 12,
};

export function expandToMonthly(amount: number, freq: RecurringFrequency) {
  return amount * MONTHLY_FACTOR[freq];
}

export function netMonthlyRecurring(recurring: RecurringRow[]) {
  let income = 0;
  let expense = 0;
  for (const r of recurring) {
    const m = expandToMonthly(num(r.amount), r.frequency);
    if (r.type === "income") income += m;
    else expense += m;
  }
  return { income, expense, net: income - expense };
}

export function sumAssets(assets: AssetRow[]) {
  return assets.reduce((s, a) => s + num(a.current_value), 0);
}

export function sumDebts(debts: DebtRow[]) {
  return debts.reduce((s, d) => s + num(d.balance), 0);
}

export function availableCash(assets: AssetRow[], accounts: AccountRow[]) {
  const liquid = assets
    .filter((a) => a.type === "cash" || a.type === "savings")
    .reduce((s, a) => s + num(a.current_value), 0);
  if (liquid > 0) return liquid;
  return accounts
    .filter((a) => a.type === "bank")
    .reduce((s, a) => Math.max(0, num(a.balance)) + s, 0);
}

export function monthlyExpenses(transactions: TransactionRow[]) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return transactions
    .filter((t) => {
      if (t.type !== "expense") return false;
      if (t.status !== "completed") return false;
      const d = new Date(t.date);
      return d.getFullYear() === y && d.getMonth() === m;
    })
    .reduce((s, t) => s + num(t.amount), 0);
}

/** Net upcoming one-off transactions hitting in the next N days */
export function upcomingNetWithin(
  transactions: TransactionRow[],
  days: number,
  now: Date = new Date()
) {
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.status !== "upcoming") continue;
    const d = new Date(t.date);
    if (d < now || d > end) continue;
    const a = num(t.amount);
    if (t.type === "income") income += a;
    else if (t.type === "expense") expense += a;
  }
  return { income, expense, net: income - expense };
}

export function getRiskLevel(buffer: number, threshold: number): RiskLevel {
  if (threshold <= 0) return buffer < 0 ? "high" : "low";
  if (buffer < threshold) return "high";
  if (buffer < threshold * 1.5) return "medium";
  return "low";
}

export interface ForecastItem {
  title: string;
  amount: number;
}

export interface ForecastPoint {
  /** 圖表 X 軸用的短標籤 e.g. "6月" */
  label: string;
  /** Accordion 用的完整月份標題 e.g. "2026年6月" */
  monthLabel: string;
  year: number;
  /** 0-based 月份索引（0 = January） */
  monthIndex: number;
  /** 該月月底的預估可用現金（給圖表用，保留欄位名稱以維持 CashflowPoint 結構相容性） */
  cash: number;
  /**
   * 預估該月底的「滾動累計餘額」：
   *   - 第 0 月：startingCash + 該月淨額
   *   - 第 N 月：上月 projectedBalance + 該月淨額
   * 與 `cash` 永遠相等，但語意更明確，給 UI / 邏輯讀取時優先使用。
   */
  projectedBalance: number;
  expectedIncomes: ForecastItem[];
  expectedExpenses: ForecastItem[];
  /** 該月淨現金流 = 收入總和 − 支出總和 */
  netCashflow: number;
}

/** 月以上頻率的週期長度，用於判斷某 recurring 是否落在某月 */
const PERIOD_MONTHS: Partial<Record<RecurringFrequency, number>> = {
  monthly: 1,
  quarterly: 3,
  semi_annually: 6,
  yearly: 12,
};

/**
 * 給定一個 recurring 與目標月份，回傳該月會發生幾次。
 * - 月以下頻率 (daily/weekly/biweekly)：用月均次數 (e.g. weekly→4)
 * - 月以上頻率 (monthly/quarterly/semi_annually/yearly)：精準落在 next_due_date 的 cycle 上，
 *   其餘月份為 0。讓 semi_annually 真的每 6 個月才出現一次。
 */
function occurrencesIn(
  r: RecurringRow,
  year: number,
  monthIdx: number
): number {
  const start = new Date(r.next_due_date);
  if (Number.isNaN(start.getTime())) return 0;
  const offset =
    (year - start.getFullYear()) * 12 + (monthIdx - start.getMonth());
  if (offset < 0) return 0;
  const period = PERIOD_MONTHS[r.frequency];
  if (period !== undefined) {
    return offset % period === 0 ? 1 : 0;
  }
  return MONTHLY_FACTOR[r.frequency];
}

function buildRecurringItemTitle(r: RecurringRow, occ: number): string {
  if (r.frequency === "monthly") return r.title;
  if (occ === 1) return `${r.title}（${FREQUENCY_LABEL[r.frequency]}）`;
  return `${r.title}（${FREQUENCY_LABEL[r.frequency]} × ${Math.round(occ)}）`;
}

export function computeForecast(opts: {
  startingCash: number;
  recurring: RecurringRow[];
  upcoming: TransactionRow[];
  months?: number;
  now?: Date;
}): ForecastPoint[] {
  const months = opts.months ?? 8;
  const now = opts.now ?? new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();

  // 預先把 upcoming 交易按月份 offset 分桶
  const upcomingByOffset = new Map<number, TransactionRow[]>();
  for (const t of opts.upcoming) {
    if (t.status !== "upcoming") continue;
    if (t.type === "transfer") continue;
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    let offset =
      (d.getFullYear() - nowYear) * 12 + (d.getMonth() - nowMonth);
    if (offset < 0) offset = 0; // 已過期 upcoming 視為本月才會發生
    if (offset >= months) continue;
    const list = upcomingByOffset.get(offset) ?? [];
    list.push(t);
    upcomingByOffset.set(offset, list);
  }

  const points: ForecastPoint[] = [];
  // 滾動累計餘額：每月 += netCashflow。初始為 startingCash（真實本金）。
  let projectedBalance = opts.startingCash;
  for (let i = 0; i < months; i++) {
    const monthDate = new Date(nowYear, nowMonth + i, 1);
    const y = monthDate.getFullYear();
    const m = monthDate.getMonth();
    const label = `${m + 1}月`;
    const monthLabel = `${y}年${m + 1}月`;

    const expectedIncomes: ForecastItem[] = [];
    const expectedExpenses: ForecastItem[] = [];

    // 1) Recurring (按頻率落點)
    for (const r of opts.recurring) {
      const occ = occurrencesIn(r, y, m);
      if (occ === 0) continue;
      const amount = num(r.amount) * occ;
      const item: ForecastItem = {
        title: buildRecurringItemTitle(r, occ),
        amount,
      };
      if (r.type === "income") expectedIncomes.push(item);
      else expectedExpenses.push(item);
    }

    // 2) 該月的 upcoming 一次性交易
    for (const t of upcomingByOffset.get(i) ?? []) {
      const item: ForecastItem = {
        title: t.description ?? "（無說明）",
        amount: num(t.amount),
      };
      if (t.type === "income") expectedIncomes.push(item);
      else if (t.type === "expense") expectedExpenses.push(item);
    }

    const monthIncome = expectedIncomes.reduce((s, x) => s + x.amount, 0);
    const monthExpense = expectedExpenses.reduce((s, x) => s + x.amount, 0);
    const netCashflow = monthIncome - monthExpense;
    projectedBalance += netCashflow;
    const rounded = Math.round(projectedBalance);

    points.push({
      label,
      monthLabel,
      year: y,
      monthIndex: m,
      cash: rounded,
      projectedBalance: rounded,
      expectedIncomes,
      expectedExpenses,
      netCashflow,
    });
  }
  return points;
}

/**
 * 計算給定 transactions 裡，「實際上已發生」的本月支出金額（含 upcoming 但已過期）。
 * 跟 buildBoardData 裡的 spent 同邏輯，但範圍是全部帳戶。
 */
export function monthlyEffectiveExpenses(
  transactions: TransactionRow[],
  now: Date = new Date()
) {
  return transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        isInMonthOf(t.date, now) &&
        effectiveTransactionStatus(t, now) === "completed"
    )
    .reduce((s, t) => s + num(t.amount), 0);
}

// ─── Per-account scoping ─────────────────────────────

export interface DashboardScope {
  accounts: AccountRow[];
  transactions: TransactionRow[];
  recurring: RecurringRow[];
  assets: AssetRow[];
  debts: DebtRow[];
}

/**
 * Returns the data slice the dashboard should compute against, given the
 * active account filter. When accountId is null we return everything; when
 * scoped we filter transactions/recurring by account_id and reduce assets/
 * debts to just that single account's view.
 */
export function scopeForAccount(
  data: DashboardScope,
  accountId: string | null
): DashboardScope {
  if (!accountId) return data;
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) return data;
  return {
    accounts: [account],
    transactions: data.transactions.filter((t) => t.account_id === accountId),
    recurring: data.recurring.filter((r) => r.account_id === accountId),
    assets: [],
    debts: [],
  };
}

export function formatCurrency(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

export const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  daily: "每日",
  weekly: "每週",
  biweekly: "每兩週",
  monthly: "每月",
  quarterly: "每季",
  semi_annually: "每半年",
  yearly: "每年",
};

// ─── Three-board model ───────────────────────────────
// 個人 / 家庭 / 補助。透過帳戶名稱關鍵字 heuristic 分類，
// 未來若 accounts 表加上 category 欄位可改成讀欄位。

export type BoardKey = "personal" | "family" | "subsidy";

export interface BoardDef {
  key: BoardKey;
  emoji: string;
  title: string;
  subtitle: string;
}

export const BOARDS: BoardDef[] = [
  {
    key: "family",
    emoji: "🏠",
    title: "家庭財務",
    subtitle: "共同帳戶：房貸、保母、學費、小朋友花費",
  },
  {
    key: "subsidy",
    emoji: "👶",
    title: "補助金流",
    subtitle: "幼兒補助與被動收入專戶",
  },
  {
    key: "personal",
    emoji: "👨‍💼",
    title: "個人財務",
    subtitle: "個人薪資、生活開銷與向共同戶的固定轉出",
  },
];

export const BOARD_DEF: Record<BoardKey, BoardDef> = Object.fromEntries(
  BOARDS.map((b) => [b.key, b])
) as Record<BoardKey, BoardDef>;

/** 依帳戶名稱關鍵字分類到三個板塊，預設落到 personal。 */
export function classifyAccount(name: string): BoardKey {
  if (/共同|台新/.test(name)) return "family";
  if (/補助|郵局/.test(name)) return "subsidy";
  return "personal";
}

export type DetailCategory =
  | "固定收入"
  | "固定支出"
  | "浮動收入"
  | "浮動支出"
  | "內部轉入"
  | "內部轉出";

export type DetailStatus =
  | "固定排程"
  | "已入帳"
  | "已扣款"
  | "預計入帳"
  | "預計扣款";

export interface BoardDetailItem {
  id: string;
  source: "recurring" | "transaction";
  category: DetailCategory;
  title: string;
  amount: number;
  /** 正數=流入，負數=流出（顯示時自行決定符號） */
  signedAmount: number;
  status: DetailStatus;
  accountName: string;
  /** ISO date string (for sorting) */
  date: string;
}

export interface BoardMetrics {
  budget: number;
  spent: number;
  remaining: number;
}

export interface BoardData {
  def: BoardDef;
  accounts: AccountRow[];
  metrics: BoardMetrics;
  items: BoardDetailItem[];
  /** 為了讓 UI 顯示空狀態提示 */
  hasAccounts: boolean;
  hasRecurringIncome: boolean;
}

function isInMonthOf(dateStr: string, now: Date) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/**
 * 取某個 Date 當天的 00:00:00（用來跟 ISO date string 做比對時忽略時分秒）。
 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * 判斷一筆 upcoming 交易是否「已到期 / 已過期」——即今日日期 >= 預計日期。
 * 在計算與顯示時要把這種交易視為 completed。
 */
function isOverdueUpcoming(t: TransactionRow, now: Date): boolean {
  if (t.status !== "upcoming") return false;
  const due = new Date(t.date);
  if (Number.isNaN(due.getTime())) return false;
  return startOfDay(due) <= startOfDay(now);
}

/**
 * 時間感知後的「實際狀態」：原本 completed 維持 completed；upcoming 但日期已到 / 已過 = completed。
 */
export function effectiveTransactionStatus(
  t: TransactionRow,
  now: Date = new Date()
): TransactionStatus {
  if (t.status === "completed") return "completed";
  return isOverdueUpcoming(t, now) ? "completed" : "upcoming";
}

function transactionStatusLabel(
  t: TransactionRow,
  effective: TransactionStatus
): DetailStatus {
  if (t.type === "income") {
    return effective === "completed" ? "已入帳" : "預計入帳";
  }
  return effective === "completed" ? "已扣款" : "預計扣款";
}

/**
 * 把 accounts / recurring / transactions 拆成三個板塊的資料切片，
 * 每片含 metrics（預算 / 已支出 / 剩餘）與整合過的明細清單。
 *
 * 時間感知：
 *   1. 「本月」嚴格以 `now` 的年月為基準，跨月自動歸零重新計算。
 *   2. `upcoming` 但日期已到 / 已過期的交易，自動視為 completed
 *      （計入「已支出」、明細狀態改為「已扣款 / 已入帳」）。
 *   3. 每次呼叫都吃一個新 `now`，所以每次 render 就是當下這一秒。
 */
export function buildBoardData(opts: {
  accounts: AccountRow[];
  recurring: RecurringRow[];
  transactions: TransactionRow[];
  now?: Date;
}): Record<BoardKey, BoardData> {
  const { accounts, recurring, transactions } = opts;
  const now = opts.now ?? new Date();

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const boardByAccountId = new Map<string, BoardKey>();
  for (const acc of accounts) {
    boardByAccountId.set(acc.id, classifyAccount(acc.name));
  }

  const result: Record<BoardKey, BoardData> = {} as Record<BoardKey, BoardData>;

  for (const def of BOARDS) {
    const boardAccounts = accounts.filter(
      (a) => classifyAccount(a.name) === def.key
    );
    const accountIdSet = new Set(boardAccounts.map((a) => a.id));

    const boardRecurring = recurring.filter(
      (r) => r.account_id && accountIdSet.has(r.account_id)
    );
    const boardTransactions = transactions.filter(
      (t) => t.account_id && accountIdSet.has(t.account_id)
    );

    // ─ Metrics ─
    let recurringIncome = 0;
    let recurringExpense = 0;
    for (const r of boardRecurring) {
      const monthly = expandToMonthly(num(r.amount), r.frequency);
      if (r.type === "income") recurringIncome += monthly;
      else recurringExpense += monthly;
    }
    const budget = recurringIncome - recurringExpense;

    const spent = boardTransactions
      .filter(
        (t) =>
          t.type === "expense" &&
          isInMonthOf(t.date, now) &&
          effectiveTransactionStatus(t, now) === "completed"
      )
      .reduce((s, t) => s + num(t.amount), 0);

    const remaining = budget - spent;

    // ─ Detail items ─
    const items: BoardDetailItem[] = [];

    for (const r of boardRecurring) {
      const amount = num(r.amount);
      const signed = r.type === "income" ? amount : -amount;
      const accName =
        (r.account_id && accountById.get(r.account_id)?.name) ?? "未指定帳戶";
      items.push({
        id: `r:${r.id}`,
        source: "recurring",
        category: r.type === "income" ? "固定收入" : "固定支出",
        title: r.title,
        amount,
        signedAmount: signed,
        status: "固定排程",
        accountName: accName,
        date: r.next_due_date,
      });
    }

    for (const t of boardTransactions) {
      if (!isInMonthOf(t.date, now)) continue;
      const amount = num(t.amount);
      const accName =
        (t.account_id && accountById.get(t.account_id)?.name) ?? "未指定帳戶";
      const title = t.description ?? "（無說明）";

      const effective = effectiveTransactionStatus(t, now);

      let category: DetailCategory;
      let signed: number;
      let status: DetailStatus;

      if (t.type === "transfer") {
        if (t.transfer_direction === "in") {
          category = "內部轉入";
          signed = amount;
          status = effective === "completed" ? "已入帳" : "預計入帳";
        } else {
          category = "內部轉出";
          signed = -amount;
          status = effective === "completed" ? "已扣款" : "預計扣款";
        }
      } else if (t.type === "income") {
        category = "浮動收入";
        signed = amount;
        status = transactionStatusLabel(t, effective);
      } else {
        category = "浮動支出";
        signed = -amount;
        status = transactionStatusLabel(t, effective);
      }

      items.push({
        id: `t:${t.id}`,
        source: "transaction",
        category,
        title,
        amount,
        signedAmount: signed,
        status,
        accountName: accName,
        date: t.date,
      });
    }

    // 排序：日期 desc，再按 source（recurring 排後面顯示為固定排程）
    items.sort((a, b) => {
      if (a.date === b.date) {
        if (a.source === b.source) return 0;
        return a.source === "transaction" ? -1 : 1;
      }
      return a.date < b.date ? 1 : -1;
    });

    result[def.key] = {
      def,
      accounts: boardAccounts,
      metrics: { budget, spent, remaining },
      items,
      hasAccounts: boardAccounts.length > 0,
      hasRecurringIncome: recurringIncome > 0,
    };
  }

  // boardByAccountId 留作未來擴充用（目前未對外暴露）
  void boardByAccountId;

  return result;
}
