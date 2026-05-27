import { formatCurrency } from "@/lib/dashboard";

interface Props {
  value: number;
  /** 自訂格式（覆寫 formatCurrency） — 例如帶 +/− 號的版本 */
  format?: (n: number) => string;
  /** 自訂顯示字串 — 給已經格式化好（e.g. signedFormat）的場景用 */
  children?: string;
  className?: string;
}

/**
 * 全專案顯示金額用的薄殼。
 *
 * 唯一職責：把 formatCurrency(value) 包進帶 `data-money` 屬性的 span，
 * 讓 globals.css 的 `body[data-privacy="on"] [data-money]` rule 可以
 * 統一套 blur + user-select:none。
 *
 * 設計上 children 跟 value 二擇一：
 *   - 通常傳 value（最常見）：<Money value={123.45} />
 *   - 已格式化（signedFormat 等）：<Money value={123} format={signedFormat} />
 *     或 <Money value={123}>{signedFormat(123)}</Money>
 *
 * 為什麼不直接覆寫 formatCurrency 回傳 JSX：因為 toast / aria-label /
 * select option 等仍需要純字串，硬改 signature 會波及 30+ 處 caller。
 * 用「包一層 Money 元件」反而是最少改動 + 型別最乾淨的路徑。
 */
export function Money({ value, format, children, className }: Props) {
  const text =
    typeof children === "string"
      ? children
      : (format ?? formatCurrency)(value);

  return (
    <span data-money className={className}>
      {text}
    </span>
  );
}
