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

export type AccountType = "bank" | "credit_card" | "cash";

/** 付款方式（per 0012 migration）— 跟 transactions.payment_method 對齊。 */
export type PaymentMethod = "cash" | "credit_card" | "transfer";

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
  payment_method?: PaymentMethod | null;
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
    .filter((a) => a.type === "bank" || a.type === "cash")
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
  // 預測「未來」嚴格從下個月起算（本月已在三大板塊呈現，避免重複）。
  // firstOffset = 1 表示「相對於 now 的下個月」，迴圈跑 months 個月 = 1..months。
  const firstOffset = 1;

  // 預先把 upcoming 交易按月份 offset 分桶
  const upcomingByOffset = new Map<number, TransactionRow[]>();
  for (const t of opts.upcoming) {
    if (t.status !== "upcoming") continue;
    if (t.type === "transfer") continue;
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    let offset =
      (d.getFullYear() - nowYear) * 12 + (d.getMonth() - nowMonth);
    // 過期 / 本月仍未實際發生的 upcoming → 全部收編進「下個月」這格，
    // 確保 projectedBalance 不會漏算尚未過帳的負擔（不然預測會比實際樂觀）。
    if (offset < firstOffset) offset = firstOffset;
    if (offset >= firstOffset + months) continue;
    const list = upcomingByOffset.get(offset) ?? [];
    list.push(t);
    upcomingByOffset.set(offset, list);
  }

  const points: ForecastPoint[] = [];
  // 滾動累計餘額：每月 += netCashflow。初始為 startingCash（真實本金）。
  let projectedBalance = opts.startingCash;
  for (let i = 0; i < months; i++) {
    const offset = firstOffset + i; // 1..months
    const monthDate = new Date(nowYear, nowMonth + offset, 1);
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

    // 2) 該月的 upcoming 一次性交易（offset 與 bucketing 一致）
    for (const t of upcomingByOffset.get(offset) ?? []) {
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

// ─── Plate-based board model ───────────────────────────────
// 取代原本寫死的 BoardKey enum + classifyAccount regex hack。
// 每個 plate (dashboard_plates 一筆) 對應一張 BoardCard，
// plate.linked_account_id 明確綁定一個 cash flow account（1:1）。

/**
 * 把 plate.name 對應到 emoji。預設 seed plates（家庭/補助/個人）對到原本
 * 那 3 個視覺；其他使用者自訂 plate 走 🏷️ 通用 fallback。
 *
 * 未來如果 dashboard_plates 加 emoji 欄位，這支就退役改讀 plate.emoji。
 */
export function derivePlateEmoji(name: string): string {
  if (/家庭|共同/.test(name)) return "🏠";
  if (/補助|被動/.test(name)) return "👶";
  if (/個人|本人/.test(name)) return "👨‍💼";
  if (/投資/.test(name)) return "📈";
  if (/儲蓄|存款/.test(name)) return "🐷";
  return "🏷️";
}

/**
 * Mobile tab label — 截前 2 字，避免長 plate 名稱把 tab bar 撐爆。
 * "家庭財務" → "家庭"、"補助金流" → "補助"，跟原本手動 mapping 行為一致。
 */
export function derivePlateShortLabel(name: string): string {
  return name.slice(0, 2);
}

export interface BoardMeta {
  plateId: string;
  name: string;
  description: string;
  emoji: string;
  shortLabel: string;
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
  /** 該筆所屬帳戶 ID。僅 transaction-source 有；recurring 不會走編輯 dialog 故省略。 */
  accountId?: string | null;
  /** DB 上的花費大類（snake_case），給編輯 dialog 預設用。僅 transaction-source。 */
  expenseCategory?: ExpenseCategory | null;
  /** 是否為內部轉帳。Transfer row 不顯示帳戶/分類編輯欄位（避免破壞兩腿配對）。 */
  isTransfer?: boolean;
  /** ISO date string (for sorting) */
  date: string;
}

export interface BoardMetrics {
  budget: number;
  spent: number;
  remaining: number;
}

export interface BoardData {
  meta: BoardMeta;
  /** 1:1 model — 最多 1 個 account（plate.linked_account_id 對應），空 = 未綁定 */
  accounts: AccountRow[];
  metrics: BoardMetrics;
  items: BoardDetailItem[];
  hasAccounts: boolean;
  hasRecurringIncome: boolean;
  /** plate.linked_account_id 為 null → UI 顯示「請到設定頁綁定帳戶」CTA */
  isUnlinked: boolean;
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
 * 把 accounts / recurring / transactions 切成 N 個 plate 對應的 board 資料，
 * 每片含 metrics（預算 / 已支出 / 剩餘）與整合過的明細清單。
 *
 * 1:1 model：每個 plate 透過 linked_account_id 綁一個 account。未綁定 →
 * accounts 空陣列、isUnlinked=true，UI 走 CTA empty state。
 *
 * 排序：依 plate.sort_order ASC 回傳陣列，UI 直接 .map render 就好，
 * 不再需要靠 BoardKey 當 dict key。
 *
 * 時間感知：跟舊版相同 — completed 嚴格本月、upcoming 過期視為 completed。
 */
export function buildBoardData(opts: {
  plates: { id: string; name: string; description: string; linked_account_id: string | null; sort_order: number }[];
  accounts: AccountRow[];
  recurring: RecurringRow[];
  transactions: TransactionRow[];
  now?: Date;
}): BoardData[] {
  const { plates, accounts, recurring, transactions } = opts;
  const now = opts.now ?? new Date();

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // plate 依 sort_order ASC 處理（caller 已排好的話照原順序；防御性再排一次）
  const orderedPlates = [...plates].sort((a, b) => a.sort_order - b.sort_order);

  return orderedPlates.map((plate) => {
    const linkedAccount = plate.linked_account_id
      ? accountById.get(plate.linked_account_id)
      : null;
    const boardAccounts: AccountRow[] = linkedAccount ? [linkedAccount] : [];
    const accountIdSet = new Set(boardAccounts.map((a) => a.id));

    const meta: BoardMeta = {
      plateId: plate.id,
      name: plate.name,
      description: plate.description,
      emoji: derivePlateEmoji(plate.name),
      shortLabel: derivePlateShortLabel(plate.name),
    };

    // 未綁定帳戶 → 直接回 zero metrics + empty items，省下後面遍歷
    if (!linkedAccount) {
      return {
        meta,
        accounts: [],
        metrics: { budget: 0, spent: 0, remaining: 0 },
        items: [],
        hasAccounts: false,
        hasRecurringIncome: false,
        isUnlinked: true,
      };
    }

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
        accountId: t.account_id,
        expenseCategory: t.category,
        isTransfer: t.type === "transfer",
        date: t.date,
      });
    }

    items.sort((a, b) => {
      if (a.date === b.date) {
        if (a.source === b.source) return 0;
        return a.source === "transaction" ? -1 : 1;
      }
      return a.date < b.date ? 1 : -1;
    });

    return {
      meta,
      accounts: boardAccounts,
      metrics: { budget, spent, remaining },
      items,
      hasAccounts: true,
      hasRecurringIncome: recurringIncome > 0,
      isUnlinked: false,
    };
  });
}
