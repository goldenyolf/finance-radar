-- ==============================================================
-- Money Radar . 0030 . transactions.category 開放自訂分類
--
-- 動機（user 2026-07-03 回報）:
--   在 /settings 新增了自訂分類「家庭醫療」，但 /transactions 編輯 dialog
--   的花費類型下拉選單看不到它 — 只有 7 個 built-in code。
--
--   root cause:
--     0001-0029 的 transactions.category 上有 transactions_category_check
--     CHECK constraint，只允許 7 個 built-in snake_case code
--     (food_dining / childcare_education / eldercare / home_living /
--     finance_insurance / transport / other)。使用者自訂的分類 code=null，
--     沒有穩定 code 可以塞進這欄，前端也就故意把自訂 category 從下拉隱藏
--     (per transaction-row-actions.tsx:92-94 comment)。
--
-- 設計:
--   a) DROP CHECK constraint — column 保留 TEXT，但接受任意字串。
--      新語意：
--        - built-in 分類 → 存 code（'food_dining' 等 7 個），backwards compat
--        - 自訂分類     → 存 categories.id（UUID）
--      前端 resolveCategory(value, lookup) 先試 byId 再試 byCode，兩種
--      形式都能查到 name + color；找不到才 fallback 到 EXPENSE_CATEGORY_LABEL.
--
--   b) 不加新欄位 category_id — 只是 column semantics 從「一定是 code」放寬
--      成「code 或 id」。少一次 join、少一組 migration，讀寫路徑統一。
--
--   c) NOT NULL 沒動（0005 早就 DROP 掉了，保持 nullable — income row 為 null）。
--
--   d) 沒有 backfill — 現有 row 都是合法的 built-in code，語意 lookup 依然對得上，
--      不用動；未來新增的自訂分類選項會寫成 UUID。
-- ==============================================================


-- --------------------------------------------------------------
-- (1) DROP CHECK constraint（多個歷史 migration 都有 DROP+ADD 過，
--     所以名字可能是 transactions_category_check 或 transactions_category_check_new；
--     idempotent 全部 IF EXISTS）
-- --------------------------------------------------------------

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_category_check;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_category_check_new;


-- ==============================================================
-- 驗證:
--   (A) constraint 已消失
--     SELECT conname, pg_get_constraintdef(oid)
--       FROM pg_constraint
--      WHERE conrelid = 'transactions'::regclass
--        AND conname ILIKE '%category%';
--     -- 應只剩下跟 category 無關的 constraint（income_category_check 保留）
--
--   (B) 試寫自訂 UUID（用你的實際 category id）
--     UPDATE transactions
--        SET category = '<some-user-category-uuid>'
--      WHERE id = '<some-tx-uuid>' AND user_id = '<your-user-uuid>';
--     -- 應該成功，前端 resolveCategory 會在 byId 命中
--
--   (C) 保留 legacy 寫法
--     UPDATE transactions
--        SET category = 'food_dining'
--      WHERE id = '<some-tx-uuid>' AND user_id = '<your-user-uuid>';
--     -- 應該成功，前端 resolveCategory 會在 byCode 命中
-- ==============================================================
