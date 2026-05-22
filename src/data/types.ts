export interface User {
  id: string;
  name: string;
  /** 安全準備金門檻 (單位: TWD) */
  emergencyFundThreshold: number;
}

export type AccountType = "bank" | "credit_card";

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  /** 銀行帳戶為正值餘額，信用卡為負值（代表負債） */
  balance: number;
}

export type TransactionStatus = "completed" | "upcoming";
export type TransactionCategory = "essential" | "non_essential";
export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  status: TransactionStatus;
  date: string; // ISO date string
}
