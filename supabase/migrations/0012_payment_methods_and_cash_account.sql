-- ==============================================================
-- Money Radar . 0012 . payment_method 維度 + 現金帳戶正式入列
--
-- 目標：
--   1) transactions 多一個 payment_method 欄位（cash / credit_card / transfer）
--      讓信用卡、匯款、現金消費場景在資料層就分得清楚。
--   2) 每個 auth.users 都自動擁有一個「現金錢包」帳戶（type='cash'），
--      LINE bot 的 fallback 才有 anchor account 可指。
--
-- 設計重點：
--   a) payment_method 設為 NULLABLE + CHECK 三值。應用層 (Quick Add / LINE bot)
--      決定預設值，不在 DB 端寫死 DEFAULT — 規則跟交易類型 / 分類 / 帳戶特性
--      綁在一起，靠 DB DEFAULT 無法表達條件邏輯。
--
--   b) 既有資料 backfill 規則 (per 用戶 spec 「依分類或帳戶特性判定」)：
--        type = 'transfer'                       -> 'transfer'
--        account.type = 'credit_card'            -> 'credit_card'
--        其餘 expense / income                    -> 'cash'   (保守預設)
--      backfill 一律 scope by transactions.user_id，多租戶不會跨污染。
--
--   c) Cash account seed：
--        - account.type = 'cash'   (新值，需先擴 accounts_type_check)
--        - account.name = '現金錢包'
--        - balance = 0    (user 自己上 /settings 校正)
--      用 INSERT ... SELECT + NOT EXISTS 一條 SQL backfill 既有 user，
--      避開 DO block + dollar-quote (per 0004 / 0007 學到的教訓)。
--
--      注意：原始 bootstrap schema 已有 accounts_type_check 只允許
--      ('bank','credit_card')，初版 0012 漏掉這層，直接 INSERT 'cash'
--      會踩 23514。section (3a) 先 drop + recreate constraint 再 seed。
--
--   d) 新會員 auth trigger 沿用 0007 的 pattern：
--        SECURITY DEFINER, inline INSERT, EXCEPTION WHEN OTHERS,
--        owner = postgres (BYPASSRLS)。任何錯都不擋註冊。
--
--   e) 全程 IF (NOT) EXISTS / DROP IF EXISTS，可重複跑。
--      ASCII-only header (per Supabase SQL Editor pre-parser quirks)。
--
-- 跑完驗證：見檔尾。
-- ==============================================================


-- --------------------------------------------------------------
-- (1) transactions.payment_method 欄位 + CHECK constraint
-- --------------------------------------------------------------

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_payment_method_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_payment_method_check
  CHECK (payment_method IS NULL
      OR payment_method IN ('cash', 'credit_card', 'transfer'));


-- --------------------------------------------------------------
-- (2) Backfill 既有 transactions
--     一條 UPDATE 一條規則，可分別重跑（已被填過的 row 用 WHERE
--     payment_method IS NULL 自動 skip，重跑安全）。
--     所有 UPDATE 隱式 scope by t.user_id（沒寫 cross-tenant join），
--     不會跨租戶污染。
-- --------------------------------------------------------------

-- 2a) type='transfer' 的交易，payment_method 必為 'transfer'
UPDATE transactions
   SET payment_method = 'transfer'
 WHERE payment_method IS NULL
   AND type = 'transfer';

-- 2b) 扣款帳戶是信用卡 -> 'credit_card'
UPDATE transactions t
   SET payment_method = 'credit_card'
  FROM accounts a
 WHERE t.payment_method IS NULL
   AND t.account_id IS NOT NULL
   AND a.id = t.account_id
   AND a.user_id = t.user_id
   AND a.type = 'credit_card';

-- 2c) 其餘 expense / income 一律先當現金
UPDATE transactions
   SET payment_method = 'cash'
 WHERE payment_method IS NULL
   AND type IN ('expense', 'income');


-- --------------------------------------------------------------
-- (3a) accounts.type CHECK 擴充 — 加入 'cash'
--      原始 schema 是 CHECK (type IN ('bank','credit_card'))，
--      直接 INSERT type='cash' 會踩 23514。重建 constraint 才能 seed。
--      idempotent：DROP IF EXISTS 後重新 ADD。
-- --------------------------------------------------------------

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_type_check;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_type_check
  CHECK (type IN ('bank', 'credit_card', 'cash'));


-- --------------------------------------------------------------
-- (3b) Cash account seed for 既有 auth.users
--      INSERT ... SELECT + NOT EXISTS 一條搞定。
--      name 寫死 '現金錢包' 方便 LINE bot / Quick Add 直接 lookup；
--      後續 user 可在 /settings 改名，name 改了也不影響 type='cash' 的判定。
-- --------------------------------------------------------------

INSERT INTO accounts (id, user_id, name, type, balance)
SELECT gen_random_uuid()::text,
       u.id,
       '現金錢包',
       'cash',
       0
  FROM auth.users u
 WHERE NOT EXISTS (
   SELECT 1 FROM accounts a
    WHERE a.user_id = u.id
      AND a.type = 'cash'
 );


-- --------------------------------------------------------------
-- (4) 新會員 auth trigger：自動 seed 現金錢包
--     獨立 trigger，additive，不動既有 categories / dashboard_plates trigger。
--     pattern 對齊 0007: SECURITY DEFINER + inline INSERT + EXCEPTION 防御。
-- --------------------------------------------------------------

CREATE OR REPLACE FUNCTION on_auth_user_seed_cash_account()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $fn$
BEGIN
  INSERT INTO accounts (id, user_id, name, type, balance)
  SELECT gen_random_uuid()::text,
         NEW.id,
         '現金錢包',
         'cash',
         0
   WHERE NOT EXISTS (
     SELECT 1 FROM accounts
      WHERE user_id = NEW.id
        AND type = 'cash'
   );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed cash account failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION on_auth_user_seed_cash_account() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_user_seed_cash_account_trg ON auth.users;

CREATE TRIGGER on_auth_user_seed_cash_account_trg
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION on_auth_user_seed_cash_account();


-- ==============================================================
-- 驗證指令（跑完手動貼到 SQL Editor 對結果）：
--
-- (A) payment_method 欄位與 constraint
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'transactions'
--      AND column_name = 'payment_method';
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'transactions_payment_method_check';
--
-- (B) Backfill 結果分布（per user）
--   SELECT user_id, payment_method, count(*)
--     FROM transactions
--    GROUP BY user_id, payment_method
--    ORDER BY user_id, payment_method;
--
-- (C) Cash account 每個 user 都有一個
--   SELECT user_id, count(*) FILTER (WHERE type = 'cash') AS cash_accounts
--     FROM accounts
--    GROUP BY user_id
--    ORDER BY user_id;
--   -- 每列 cash_accounts 必須 = 1
--
-- (D) Trigger 確實裝上
--   SELECT tgname, tgenabled
--     FROM pg_trigger
--    WHERE tgname = 'on_auth_user_seed_cash_account_trg';
-- ==============================================================
