import { User, Account, Transaction } from "./types";

// ─── User ────────────────────────────────────────────
export const user: User = {
  id: "u1",
  name: "小明",
  emergencyFundThreshold: 50000, // 安全準備金門檻 5 萬元
};

// ─── Accounts ────────────────────────────────────────
export const accounts: Account[] = [
  {
    id: "acc1",
    userId: "u1",
    name: "台北富邦 活存",
    type: "bank",
    balance: 120000,
  },
  {
    id: "acc2",
    userId: "u1",
    name: "國泰世華 數位帳戶",
    type: "bank",
    balance: 35000,
  },
  {
    id: "acc3",
    userId: "u1",
    name: "中信 LINE Pay 信用卡",
    type: "credit_card",
    balance: -8500, // 本期待繳
  },
  {
    id: "acc4",
    userId: "u1",
    name: "玉山 U Bear 信用卡",
    type: "credit_card",
    balance: -3200,
  },
];

// ─── Transactions ────────────────────────────────────
export const transactions: Transaction[] = [
  // 已發生 — 收入
  {
    id: "t1",
    userId: "u1",
    accountId: "acc1",
    description: "6 月薪水",
    amount: 48000,
    type: "income",
    category: "essential",
    status: "completed",
    date: "2026-05-05",
  },
  // 已發生 — 支出
  {
    id: "t2",
    userId: "u1",
    accountId: "acc3",
    description: "超市採購",
    amount: 2300,
    type: "expense",
    category: "essential",
    status: "completed",
    date: "2026-05-10",
  },
  {
    id: "t3",
    userId: "u1",
    accountId: "acc4",
    description: "Netflix 訂閱",
    amount: 390,
    type: "expense",
    category: "non_essential",
    status: "completed",
    date: "2026-05-12",
  },

  // ─── 未來支出（6 月） ─────────────────────────────
  {
    id: "t4",
    userId: "u1",
    accountId: "acc1",
    description: "房租",
    amount: 15000,
    type: "expense",
    category: "essential",
    status: "upcoming",
    date: "2026-06-01",
  },
  {
    id: "t5",
    userId: "u1",
    accountId: "acc1",
    description: "電費",
    amount: 1800,
    type: "expense",
    category: "essential",
    status: "upcoming",
    date: "2026-06-05",
  },
  {
    id: "t6",
    userId: "u1",
    accountId: "acc1",
    description: "手機月租",
    amount: 499,
    type: "expense",
    category: "essential",
    status: "upcoming",
    date: "2026-06-10",
  },
  {
    id: "t7",
    userId: "u1",
    accountId: "acc3",
    description: "信用卡帳單（中信）",
    amount: 8500,
    type: "expense",
    category: "essential",
    status: "upcoming",
    date: "2026-06-15",
  },
  {
    id: "t8",
    userId: "u1",
    accountId: "acc4",
    description: "信用卡帳單（玉山）",
    amount: 3200,
    type: "expense",
    category: "essential",
    status: "upcoming",
    date: "2026-06-15",
  },
  {
    id: "t9",
    userId: "u1",
    accountId: "acc1",
    description: "朋友生日禮物",
    amount: 1500,
    type: "expense",
    category: "non_essential",
    status: "upcoming",
    date: "2026-06-08",
  },
  {
    id: "t10",
    userId: "u1",
    accountId: "acc1",
    description: "健身房年費（分期）",
    amount: 1200,
    type: "expense",
    category: "non_essential",
    status: "upcoming",
    date: "2026-06-20",
  },
  {
    id: "t11",
    userId: "u1",
    accountId: "acc1",
    description: "機車保險",
    amount: 3600,
    type: "expense",
    category: "essential",
    status: "upcoming",
    date: "2026-06-25",
  },
];
