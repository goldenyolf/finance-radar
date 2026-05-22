import {
  Wallet,
  CreditCard,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  CalendarClock,
  TrendingDown,
} from "lucide-react";
import { user, accounts, transactions } from "@/data/mock";
import { Transaction } from "@/data/types";

// ─── 計算邏輯 ──────────────────────────────────────

/** 總流動資產 = 銀行餘額總和 + 信用卡負債(負值) */
function getTotalAssets() {
  return accounts.reduce((sum, acc) => sum + acc.balance, 0);
}

/** 取得下個月的所有已知支出 */
function getNextMonthExpenses(): Transaction[] {
  const now = new Date();
  const nextMonth = now.getMonth() + 1;
  const nextYear = nextMonth > 11 ? now.getFullYear() + 1 : now.getFullYear();
  const normalizedMonth = nextMonth > 11 ? 0 : nextMonth;

  return transactions.filter((t) => {
    const d = new Date(t.date);
    return (
      t.type === "expense" &&
      t.status === "upcoming" &&
      d.getMonth() === normalizedMonth &&
      d.getFullYear() === nextYear
    );
  });
}

/** 下個月已知支出總額 */
function getNextMonthTotal(expenses: Transaction[]) {
  return expenses.reduce((sum, t) => sum + t.amount, 0);
}

/** 風險等級 */
function getRiskLevel(totalAssets: number, nextMonthTotal: number) {
  const remaining = totalAssets - nextMonthTotal;
  if (remaining < user.emergencyFundThreshold) return "high";
  if (remaining < user.emergencyFundThreshold * 1.5) return "medium";
  return "low";
}

// ─── 格式化 ─────────────────────────────────────────

function formatCurrency(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─── 元件 ───────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${accent ?? "border-gray-200 bg-white"}`}
    >
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── 主頁面 ─────────────────────────────────────────

export default function Dashboard() {
  const totalAssets = getTotalAssets();
  const nextMonthExpenses = getNextMonthExpenses();
  const nextMonthTotal = getNextMonthTotal(nextMonthExpenses);
  const risk = getRiskLevel(totalAssets, nextMonthTotal);
  const remaining = totalAssets - nextMonthTotal;

  const riskConfig = {
    high: {
      label: "高風險",
      desc: `淨資產 ${formatCurrency(remaining)} 低於準備金門檻 ${formatCurrency(user.emergencyFundThreshold)}`,
      accent: "border-red-300 bg-red-50 text-red-700",
      icon: <ShieldAlert className="w-5 h-5 text-red-500" />,
    },
    medium: {
      label: "中風險",
      desc: `接近準備金門檻，請留意支出`,
      accent: "border-yellow-300 bg-yellow-50 text-yellow-700",
      icon: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    },
    low: {
      label: "安全",
      desc: `淨資產充足，高於準備金門檻`,
      accent: "border-green-300 bg-green-50 text-green-700",
      icon: <ShieldCheck className="w-5 h-5 text-green-500" />,
    },
  };

  const r = riskConfig[risk];

  const upcomingExpenses = transactions
    .filter((t) => t.status === "upcoming" && t.type === "expense")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-1">個人財務戰情室</h1>
      <p className="text-gray-500 text-sm mb-8">
        {user.name}，這是你目前的財務概覽
      </p>

      {/* 三張摘要卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <StatCard
          icon={<Wallet className="w-4 h-4" />}
          label="總流動資產"
          value={formatCurrency(totalAssets)}
          sub={`${accounts.filter((a) => a.type === "bank").length} 個銀行帳戶 / ${accounts.filter((a) => a.type === "credit_card").length} 張信用卡`}
        />
        <StatCard
          icon={<CreditCard className="w-4 h-4" />}
          label="下月已知支出"
          value={formatCurrency(nextMonthTotal)}
          sub={`共 ${nextMonthExpenses.length} 筆`}
        />
        <StatCard
          icon={r.icon}
          label="斷炊風險"
          value={r.label}
          sub={r.desc}
          accent={r.accent}
        />
      </div>

      {/* 帳戶一覽 */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Wallet className="w-5 h-5" /> 帳戶一覽
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex justify-between items-center rounded-xl border border-gray-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-sm">{acc.name}</p>
                <p className="text-xs text-gray-400">
                  {acc.type === "bank" ? "銀行帳戶" : "信用卡"}
                </p>
              </div>
              <p
                className={`font-bold ${acc.balance >= 0 ? "text-green-600" : "text-red-500"}`}
              >
                {formatCurrency(acc.balance)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 近期待支出表格 */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <CalendarClock className="w-5 h-5" /> 近期待支出項目
        </h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">日期</th>
                <th className="text-left px-4 py-3 font-medium">說明</th>
                <th className="text-left px-4 py-3 font-medium">類別</th>
                <th className="text-right px-4 py-3 font-medium">金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {upcomingExpenses.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(t.date)}
                  </td>
                  <td className="px-4 py-3">{t.description}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.category === "essential"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {t.category === "essential" ? "必要" : "非必要"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-500 flex items-center justify-end gap-1">
                    <TrendingDown className="w-3 h-3" />
                    {formatCurrency(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={3}>
                  合計
                </td>
                <td className="px-4 py-3 text-right text-red-600">
                  {formatCurrency(
                    upcomingExpenses.reduce((s, t) => s + t.amount, 0)
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </main>
  );
}
