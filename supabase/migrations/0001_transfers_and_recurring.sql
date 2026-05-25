-- ──────────────────────────────────────────────────────────────
-- Money Radar · 0001 · 內部轉帳 + 週期性收支升級
-- 在 Supabase Dashboard → SQL Editor 整個貼上後執行即可。
-- 全部使用 IF EXISTS / IF NOT EXISTS，可重複執行 (idempotent)。
-- ──────────────────────────────────────────────────────────────

-- 1. transactions：允許 type='transfer'，並加上配對欄位
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('income', 'expense', 'transfer'));

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS transfer_group_id UUID;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS transfer_direction TEXT
  CHECK (transfer_direction IN ('out', 'in'));

CREATE INDEX IF NOT EXISTS transactions_transfer_group_id_idx
  ON transactions(transfer_group_id);

CREATE INDEX IF NOT EXISTS transactions_account_id_idx
  ON transactions(account_id);

-- 2. recurring_payments：補上 type / account_id / category
--    順便讓 id 自動帶 uuid (有些 schema 預設沒設 default)
ALTER TABLE recurring_payments
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE recurring_payments
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'expense';

ALTER TABLE recurring_payments
  DROP CONSTRAINT IF EXISTS recurring_payments_type_check;

ALTER TABLE recurring_payments
  ADD CONSTRAINT recurring_payments_type_check
  CHECK (type IN ('income', 'expense'));

ALTER TABLE recurring_payments
  ADD COLUMN IF NOT EXISTS account_id UUID
  REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE recurring_payments
  ADD COLUMN IF NOT EXISTS category TEXT
  CHECK (category IN ('essential', 'non_essential'));

CREATE INDEX IF NOT EXISTS recurring_payments_account_id_idx
  ON recurring_payments(account_id);

-- ──────────────────────────────────────────────────────────────
-- 完成。後續若要回滾單一變更，請手動下對應 DROP / ALTER 語法。
-- ──────────────────────────────────────────────────────────────
