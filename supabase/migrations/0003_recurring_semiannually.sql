-- ──────────────────────────────────────────────────────────────
-- Money Radar · 0003 · recurring_payments.frequency 加上 'semi_annually'
--
-- 若你的 schema 對 frequency 欄位有 CHECK constraint，這支會把它換掉；
-- 沒有的話也安全。重複執行不會壞。
-- ──────────────────────────────────────────────────────────────

ALTER TABLE recurring_payments
  DROP CONSTRAINT IF EXISTS recurring_payments_frequency_check;

ALTER TABLE recurring_payments
  ADD CONSTRAINT recurring_payments_frequency_check
  CHECK (frequency IN (
    'daily', 'weekly', 'biweekly', 'monthly',
    'quarterly', 'semi_annually', 'yearly'
  ));
