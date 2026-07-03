/**
 * 交易描述前處理 — 剝掉常見「行為前綴 + 冒號」的記帳口語習慣寫法。
 *
 * 例：
 *   「支付：早餐」   →「早餐」
 *   「支出：計程車」 →「計程車」
 *   「花費：星巴克」 →「星巴克」
 *   「領到：薪水」   →「薪水」
 *
 * 邏輯：
 *   - 只在**明確有 label + 冒號**時才剝，正常描述完全不動
 *     (e.g.「支付咖啡」沒冒號 → 保留)。
 *   - 全形 `：` 半形 `:` 都接。
 *   - Label 白名單只放 unambiguous 的記帳詞；不放「買」「付」等雙字動詞
 *     以外的模糊詞，避免誤剝「買菜給老媽」這種用意動作作為描述的自然句。
 *   - 剝完 trim 空白，避免留下前導 / 尾綴空白。
 *
 * 適用場景：
 *   - `createTransaction` / `updateTransaction` / `createTransfer` server action
 *   - LINE webhook LLM/regex 之後、insert 之前的 item 值
 *   - CSV import row.description 前處理（如果之後要加）
 *
 * 為什麼不在 LLM prompt 教它處理：
 *   deterministic 比 model behavior 穩、跨管道統一（LINE / Web / CSV 都吃）、
 *   零 token 成本、零 timeout 風險。LLM prompt 已經很長了不再擴大。
 */

const LABEL_PREFIX_RE =
  /^(?:支付|支出|消費|花費|購買|繳費|付款|花了|買了|收入|入帳|領到|領了|收到|收了)\s*[：:]\s*/;

export function stripDescriptionLabel(desc: string): string {
  return desc.replace(LABEL_PREFIX_RE, "").trim();
}
