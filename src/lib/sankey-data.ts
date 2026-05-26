import { getAccountLabel } from "@/lib/account-display";
import { buildCategoryLookup, type CategoryRow } from "@/lib/categories";
import {
  num,
  type AccountRow,
  type TransactionRow,
} from "@/lib/dashboard";
import {
  EXPENSE_CATEGORY_COLOR,
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/expense-categories";

export type SankeyNodeType = "income" | "account" | "expense";

export interface SankeyNode {
  /** 顯示名稱（會出現在圖上 + tooltip） */
  name: string;
  /** 分類群組，用來決定節點顏色 */
  type: SankeyNodeType;
  /** 自訂顏色（覆蓋預設群組色） */
  color: string;
}

export interface SankeyLink {
  /** node 在 nodes 陣列中的 index — recharts Sankey 要求 */
  source: number;
  target: number;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

const INCOME_COLOR = "#86efac"; // emerald-300 — 收入流入感
const ACCOUNT_COLOR = "#93c5fd"; // blue-300 — 資金停泊處

function isInMonth(dateStr: string, ref: Date): boolean {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth()
  );
}

type CategoryLookup = ReturnType<typeof buildCategoryLookup> | null;

function categoryLabel(
  cat: ExpenseCategory | null | undefined,
  lookup: CategoryLookup
): string {
  const key = (cat ?? "other") as ExpenseCategory;
  return (
    lookup?.byCode.get(key)?.name ?? EXPENSE_CATEGORY_LABEL[key] ?? "其他"
  );
}

function categoryColor(
  cat: ExpenseCategory | null | undefined,
  lookup: CategoryLookup
): string {
  const key = (cat ?? "other") as ExpenseCategory;
  return (
    lookup?.byCode.get(key)?.color ?? EXPENSE_CATEGORY_COLOR[key] ?? "#94A3B8"
  );
}

/**
 * 把該月份 transactions 攤平成 Sankey 三層流向：
 *   收入分類 → 帳戶 → 支出分類
 *
 * 設計選擇：
 *   - Income source 走 description（一個月相同描述會被加總，避免薪水重複出現）
 *   - Transfer 一律 skip — 它是內部位移，視覺化會誤導
 *   - 0 或負值 link 一律過濾，recharts Sankey 對 0 值會崩潰
 *   - 沒有 in/out 流量的帳戶不會出現在 Sankey（沒人去看的孤兒節點）
 */
export function buildSankeyData(
  transactions: TransactionRow[],
  accounts: AccountRow[],
  now: Date,
  categories?: CategoryRow[]
): SankeyData {
  const lookup = categories ? buildCategoryLookup(categories) : null;
  // 1. 撈本月、completed、非 transfer
  const monthTxns = transactions.filter(
    (t) =>
      t.status === "completed" &&
      t.type !== "transfer" &&
      isInMonth(t.date, now)
  );

  // 2. 加總：
  //    incomeSums[sourceName][accountId] = amount
  //    expenseSums[accountId][category]  = amount
  const incomeSums = new Map<string, Map<string, number>>();
  const expenseSums = new Map<string, Map<ExpenseCategory, number>>();

  for (const t of monthTxns) {
    const amt = Math.abs(num(t.amount));
    if (amt <= 0) continue;
    const accId = t.account_id;
    if (!accId) continue;

    if (t.type === "income") {
      const sourceName = (t.description ?? "其他收入").trim() || "其他收入";
      let inner = incomeSums.get(sourceName);
      if (!inner) {
        inner = new Map();
        incomeSums.set(sourceName, inner);
      }
      inner.set(accId, (inner.get(accId) ?? 0) + amt);
    } else if (t.type === "expense") {
      const cat = (t.category ?? "other") as ExpenseCategory;
      let inner = expenseSums.get(accId);
      if (!inner) {
        inner = new Map();
        expenseSums.set(accId, inner);
      }
      inner.set(cat, (inner.get(cat) ?? 0) + amt);
    }
  }

  // 3. 蒐集會出現在 Sankey 的帳戶（必須有 in 或 out 流量）
  const activeAccountIds = new Set<string>();
  for (const inner of incomeSums.values()) {
    for (const accId of inner.keys()) activeAccountIds.add(accId);
  }
  for (const accId of expenseSums.keys()) activeAccountIds.add(accId);

  // 4. 建 nodes — 三組 index 區段：[income | account | expense]
  const nodes: SankeyNode[] = [];
  const incomeIndex = new Map<string, number>();
  const accountIndex = new Map<string, number>();
  const expenseIndex = new Map<ExpenseCategory, number>();

  // 4a. income nodes
  for (const sourceName of incomeSums.keys()) {
    incomeIndex.set(sourceName, nodes.length);
    nodes.push({
      name: sourceName,
      type: "income",
      color: INCOME_COLOR,
    });
  }

  // 4b. account nodes（按 accounts 表順序，但只放 active 的）
  for (const acc of accounts) {
    if (!activeAccountIds.has(acc.id)) continue;
    accountIndex.set(acc.id, nodes.length);
    nodes.push({
      name: getAccountLabel(acc.id, acc.name),
      type: "account",
      color: ACCOUNT_COLOR,
    });
  }
  // 補 fallback：transactions 指向但 accounts 表沒有的 id（防呆）
  for (const accId of activeAccountIds) {
    if (accountIndex.has(accId)) continue;
    accountIndex.set(accId, nodes.length);
    nodes.push({
      name: getAccountLabel(accId, null),
      type: "account",
      color: ACCOUNT_COLOR,
    });
  }

  // 4c. expense nodes（依本月實際出現的 category，色彩走專屬色票）
  const usedExpenseCats = new Set<ExpenseCategory>();
  for (const inner of expenseSums.values()) {
    for (const cat of inner.keys()) usedExpenseCats.add(cat);
  }
  for (const cat of usedExpenseCats) {
    expenseIndex.set(cat, nodes.length);
    nodes.push({
      name: categoryLabel(cat, lookup),
      type: "expense",
      color: categoryColor(cat, lookup),
    });
  }

  // 5. 建 links（source / target 都是 node index）
  const links: SankeyLink[] = [];
  for (const [sourceName, inner] of incomeSums) {
    const srcIdx = incomeIndex.get(sourceName)!;
    for (const [accId, value] of inner) {
      if (value <= 0) continue;
      const tgtIdx = accountIndex.get(accId);
      if (tgtIdx === undefined) continue;
      links.push({ source: srcIdx, target: tgtIdx, value });
    }
  }
  for (const [accId, inner] of expenseSums) {
    const srcIdx = accountIndex.get(accId)!;
    for (const [cat, value] of inner) {
      if (value <= 0) continue;
      const tgtIdx = expenseIndex.get(cat)!;
      links.push({ source: srcIdx, target: tgtIdx, value });
    }
  }

  return { nodes, links };
}
