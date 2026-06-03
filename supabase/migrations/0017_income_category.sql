-- ==============================================================
-- Money Radar . 0017 . transactions.income_category 多維度收入分類
--
-- 動機：
--   既有 transactions.category 是 expense 專屬枚舉（food_dining /
--   transport / home_living / ...）— 對 income 無意義一律寫 null。
--   隨著 LINE LLM prompt 強化、希望大腦能把「發薪 / 接案 / 配息 / 補助」
--   分流到正確維度，讓分析頁的「財務彈性 - 收入多元化指標」有資料源。
--
-- 設計：
--   a) 新欄位 income_category TEXT NULL — 不 overload 既有 category。
--      type='expense' 永遠 null；type='income' 由 LINE LLM / Quick Add /
--      編輯 dialog 填入四選一；type='transfer' 一律 null（轉帳兩腿互抵）。
--   b) CHECK enum 對齊全專案 snake_case 規範 (per memory db_enum_naming)
--      四值：salary / side_hustle / investment / other
--   c) 不對既有資料做 backfill — 落 NULL = 「歷史 income 沒分類」UI 走
--      empty state；user 想補就到明細頁編輯。
--   d) idempotent + IF EXISTS — DROP+ADD constraint 可重跑安全。
-- ==============================================================


-- --------------------------------------------------------------
-- (1) 加新欄位
-- --------------------------------------------------------------

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS income_category TEXT;


-- --------------------------------------------------------------
-- (2) CHECK enum — snake_case 對齊全專案 token
-- --------------------------------------------------------------

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_income_category_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_income_category_check
  CHECK (income_category IS NULL
      OR income_category IN ('salary', 'side_hustle', 'investment', 'other'));


-- ==============================================================
-- 驗證指令：
--
-- (A) 欄位 + CHECK 都存在
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'transactions'
--      AND column_name = 'income_category';
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'transactions_income_category_check';
--
-- (B) 試插 sanity check（SQL Editor 用 explicit UUID，per memory）
--   INSERT INTO transactions (user_id, account_id, description, amount, type, priority, status, date, income_category)
--   VALUES ('<your uuid>', '<your account>', '測試薪水', 50000, 'income', 'non_essential', 'completed', current_date, 'salary');
--   -- 成功 → 立刻刪掉
--   DELETE FROM transactions WHERE description = '測試薪水';
--
-- (C) 違反 enum 應該炸 23514
--   INSERT INTO transactions (..., income_category) VALUES (..., 'unknown');
--   -- ERROR: 23514 violates check constraint
-- ==============================================================
