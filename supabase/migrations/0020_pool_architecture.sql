-- ==============================================================
-- Money Radar . 0020 . 母子大水庫制 + 郵局專款隔離
--
-- 動機（UAT 結論）:
--   實體帳戶系統過度工程 - user 並不在乎「中信 vs 玉山」這種銀行細節，
--   只在乎「家庭 vs 個人 vs 現金」三個視角。Phase Cash + 0014 plates 已
--   為這個方向鋪好路（plate 是 N:1 multi-binding），現在正式落地語意層。
--
-- 4 個池子 (accounts.code):
--   family_pool   = 家庭公庫    (bank) - 日常家庭/育兒/公帳開銷
--   personal_pool = 個人零用    (bank) - 個人薪資/個人消費
--   post_office   = 郵局專戶    (bank) - 兒童補助 + 緊急應急（spec priority 1）
--   cash_wallet   = 隨身現金    (cash) - 口袋現金/小額/早餐/夜市
--
-- 3 個首頁 plates（既有 3 plates 就地重新命名 + rebind，sort_order 重排）:
--   家庭 (sort 0) -> {family_pool, post_office}（spec：家庭卡子列表展示郵局）
--   個人 (sort 1) -> {personal_pool}
--   現金 (sort 2) -> {cash_wallet}
--
-- 資料安全:
--   - 既有 5 個帳戶全部就地 rename + 補 code，**transactions 0 改動**
--   - 用 name match 找出舊帳戶，code IS NULL guard 確保 idempotent
--   - 缺哪幾個 pool 就 INSERT NOT EXISTS 補哪幾個（user 1c56ddf2 缺 3 個）
--
-- Migration order (重要):
--   (1) 加 code 欄位 + CHECK + 唯一索引
--   (2) Rename existing accounts（按 name 對 code）
--   (3) INSERT missing pools per user
--   (4) Refresh accounts.keywords（spec routing 規則）
--   (5) UPDATE categories.default_account_id（家庭分類 -> family_pool 等）
--   (6) UPDATE existing dashboard_plates（rename + rebind + reorder）
--   (7) CREATE OR REPLACE trigger 0012 fn -> seed 4 pools 不只 cash
--   (8) CREATE OR REPLACE trigger 0014 fn -> 新會員 plates 按 code bind
--
-- 慣例對齊:
--   - ASCII-only header (per memory: SQL Editor pre-parser quirks)
--   - 多租戶 scope 全部 join by user_id (per memory: 多租戶 UPDATE)
--   - 不用 DO block (per 0013 教訓)；CREATE OR REPLACE FUNCTION 才用 dollar-quote
--   - 重跑安全：IF NOT EXISTS / code IS NULL / NOT EXISTS guards
-- ==============================================================


-- --------------------------------------------------------------
-- (1) accounts.code 欄位 + CHECK + per-user 唯一索引
-- --------------------------------------------------------------

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS code TEXT;

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_code_check;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_code_check
  CHECK (code IS NULL
      OR code IN ('family_pool', 'personal_pool', 'post_office', 'cash_wallet'));

-- per-user 唯一：同一 user 不能有兩個 family_pool。partial index 因為
-- code NULL 的 legacy / 自訂帳戶不受此限。per memory: partial unique
-- 的 ON CONFLICT 要重寫 WHERE - 本檔目前不走 ON CONFLICT，純 INSERT
-- NOT EXISTS pattern，所以索引本身夠用。
CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_code_unique
  ON accounts (user_id, code)
  WHERE code IS NOT NULL;


-- --------------------------------------------------------------
-- (2) Rename existing accounts + 補 code
--     用 name match 對應到新 code；code IS NULL guard 讓重跑安全
--     （第二次跑時 code 已不為 NULL，整段 skip）。
--     每筆 UPDATE 隱式 scope by row.user_id（沒 cross-user join）。
-- --------------------------------------------------------------

-- a) 家庭共同帳戶 -> 家庭公庫 / family_pool
UPDATE accounts
   SET name = '家庭公庫',
       code = 'family_pool'
 WHERE code IS NULL
   AND name = '家庭共同帳戶'
   AND type = 'bank';

-- b) 個人主帳戶 -> 個人零用 / personal_pool
UPDATE accounts
   SET name = '個人零用',
       code = 'personal_pool'
 WHERE code IS NULL
   AND name = '個人主帳戶'
   AND type = 'bank';

-- c) 補助與投資專戶 -> 郵局專戶 / post_office
UPDATE accounts
   SET name = '郵局專戶',
       code = 'post_office'
 WHERE code IS NULL
   AND name = '補助與投資專戶'
   AND type = 'bank';

-- d) 現金錢包 -> 隨身現金 / cash_wallet
--    type='cash' guard 防御萬一有 user 另建了 name='現金錢包' 的 bank 戶
UPDATE accounts
   SET name = '隨身現金',
       code = 'cash_wallet'
 WHERE code IS NULL
   AND name = '現金錢包'
   AND type = 'cash';


-- --------------------------------------------------------------
-- (3) INSERT missing pools per user
--     for-each-user 補齊 4 pool — user 1c56ddf2 缺 family/personal/post,
--     a5da7e24 全有不會重複建。NOT EXISTS guard 重跑安全。
-- --------------------------------------------------------------

INSERT INTO accounts (id, user_id, name, type, balance, code)
SELECT gen_random_uuid()::text, u.id, '家庭公庫', 'bank', 0, 'family_pool'
  FROM auth.users u
 WHERE NOT EXISTS (
   SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.code = 'family_pool'
 );

INSERT INTO accounts (id, user_id, name, type, balance, code)
SELECT gen_random_uuid()::text, u.id, '個人零用', 'bank', 0, 'personal_pool'
  FROM auth.users u
 WHERE NOT EXISTS (
   SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.code = 'personal_pool'
 );

INSERT INTO accounts (id, user_id, name, type, balance, code)
SELECT gen_random_uuid()::text, u.id, '郵局專戶', 'bank', 0, 'post_office'
  FROM auth.users u
 WHERE NOT EXISTS (
   SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.code = 'post_office'
 );

-- cash_wallet 一般已由 0012 trigger seed，rename 已處理；防御性補一條
INSERT INTO accounts (id, user_id, name, type, balance, code)
SELECT gen_random_uuid()::text, u.id, '隨身現金', 'cash', 0, 'cash_wallet'
  FROM auth.users u
 WHERE NOT EXISTS (
   SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.code = 'cash_wallet'
 );


-- --------------------------------------------------------------
-- (4) Refresh accounts.keywords（spec routing 規則）
--     UNCONDITIONAL UPDATE — 不加 cardinality=0 guard，因為 0019 backfill
--     的舊 keywords（'個人主'/'家庭共同'）對新命名已過時，要強制刷新。
--     User 後續若手動加 keywords 會被本次刷新沖掉，但目前沒人手改過
--     （0019 才剛上、沒 UI），spec 要對齊新規則為先。
-- --------------------------------------------------------------

-- family_pool: 保留台新銀行別名 + 新「家庭/公庫」語意
UPDATE accounts
   SET keywords = ARRAY['台新', '台新銀行', '家庭公庫', '公庫']
 WHERE code = 'family_pool';

-- personal_pool: 保留中信別名 + 新「個人零用」語意
UPDATE accounts
   SET keywords = ARRAY['中信', '中國信託', '個人零用']
 WHERE code = 'personal_pool';

-- post_office: spec priority 1「郵局」一律鎖此戶 + 補助關鍵字
UPDATE accounts
   SET keywords = ARRAY['郵局', '中華郵政', '補助', '幼兒補助']
 WHERE code = 'post_office';

-- cash_wallet: spec priority 3「現金/夜市/早餐」走攔截器鎖此戶
UPDATE accounts
   SET keywords = ARRAY['現金', '錢包', '夜市', '早餐']
 WHERE code = 'cash_wallet';


-- --------------------------------------------------------------
-- (5) UPDATE categories.default_account_id
--     spec priority 2「家庭分類自動歸 family_pool / 個人分類歸 personal」
--     在 categories 層一次設定，沿用既有 fallback chain — webhook 零修改。
--
--     - family_pool : home_living / childcare_education / eldercare / finance_insurance
--     - personal_pool: food_dining / transport / other（cash 路由由 cash_wallet.keywords 攔截）
--
--     JOIN by c.user_id = a.user_id 確保多租戶正確配對。
--     UNCONDITIONAL UPDATE — 強制對齊 spec；user 後續可在 settings 微調覆寫。
-- --------------------------------------------------------------

UPDATE categories c
   SET default_account_id = a.id
  FROM accounts a
 WHERE c.user_id = a.user_id
   AND a.code = 'family_pool'
   AND c.type = 'expense'
   AND c.code IN ('home_living', 'childcare_education', 'eldercare', 'finance_insurance');

UPDATE categories c
   SET default_account_id = a.id
  FROM accounts a
 WHERE c.user_id = a.user_id
   AND a.code = 'personal_pool'
   AND c.type = 'expense'
   AND c.code IN ('food_dining', 'transport', 'other');


-- --------------------------------------------------------------
-- (6) UPDATE existing dashboard_plates -> 3 大水庫
--     既有 3 plates (家庭財務/補助金流/個人財務) 就地重命名 + rebind +
--     重排 sort_order，避免 DELETE + INSERT 破壞 plate id（plates 沒有
--     外鍵但 UI 端可能保有 lastSeenPlateId 等）。
--
--     映射（per spec 3 bento cards 家庭/個人/現金）:
--       家庭財務 (sort 0) -> 家庭, bind {family_pool, post_office}
--       補助金流 (sort 1) -> 個人, bind {personal_pool}, sort=1
--       個人財務 (sort 2) -> 現金, bind {cash_wallet}, sort=2
--
--     UPDATE...FROM lateral 撈 4 個 account id (聚成單列 row) 一次塞進去，
--     避免 per-user correlated subquery。
-- --------------------------------------------------------------

UPDATE dashboard_plates p
   SET name = '家庭',
       description = '家庭日常開銷與兒童補助專款',
       linked_account_ids = ARRAY[a_family.id, a_post.id],
       sort_order = 0
  FROM accounts a_family, accounts a_post
 WHERE p.user_id = a_family.user_id
   AND p.user_id = a_post.user_id
   AND a_family.code = 'family_pool'
   AND a_post.code = 'post_office'
   AND p.name = '家庭財務';

UPDATE dashboard_plates p
   SET name = '個人',
       description = '個人薪資、日常消費與訂閱',
       linked_account_ids = ARRAY[a.id],
       sort_order = 1
  FROM accounts a
 WHERE p.user_id = a.user_id
   AND a.code = 'personal_pool'
   AND p.name = '補助金流';

UPDATE dashboard_plates p
   SET name = '現金',
       description = '口袋零用、夜市與早餐',
       linked_account_ids = ARRAY[a.id],
       sort_order = 2
  FROM accounts a
 WHERE p.user_id = a.user_id
   AND a.code = 'cash_wallet'
   AND p.name = '個人財務';


-- --------------------------------------------------------------
-- (7) CREATE OR REPLACE trigger fn: 新會員自動 seed 4 pools
--     替換 0012 的 on_auth_user_seed_cash_account() — 從只 seed cash
--     升級成一次 seed 4 個 pool，含 keywords。trigger 名稱 _trg 不變,
--     字母序 'c' < 'd' 仍領先 dashboard_plates trigger（per 0014 註解）。
-- --------------------------------------------------------------

CREATE OR REPLACE FUNCTION on_auth_user_seed_cash_account()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $fn$
BEGIN
  INSERT INTO accounts (id, user_id, name, type, balance, code, keywords)
  SELECT gen_random_uuid()::text, NEW.id, v.name, v.type, 0, v.code, v.keywords
  FROM (VALUES
    ('家庭公庫', 'bank', 'family_pool',   ARRAY['台新', '台新銀行', '家庭公庫', '公庫']),
    ('個人零用', 'bank', 'personal_pool', ARRAY['中信', '中國信託', '個人零用']),
    ('郵局專戶', 'bank', 'post_office',   ARRAY['郵局', '中華郵政', '補助', '幼兒補助']),
    ('隨身現金', 'cash', 'cash_wallet',   ARRAY['現金', '錢包', '夜市', '早餐'])
  ) AS v(name, type, code, keywords)
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.user_id = NEW.id AND a.code = v.code
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed pool accounts failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION on_auth_user_seed_cash_account() OWNER TO postgres;


-- --------------------------------------------------------------
-- (8) CREATE OR REPLACE dashboard_plates trigger fn -> 按 code bind
--     新會員 plates 直接 bind 正確 pool 而非空 array。trigger 字母序
--     '_d_' 在 '_c_' 之後 (per 0014)，所以 fn 內 SELECT pool ids 時
--     accounts 必已 seed 好。
-- --------------------------------------------------------------

CREATE OR REPLACE FUNCTION on_auth_user_seed_dashboard_plates()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $fn$
DECLARE
  v_family_id    text;
  v_personal_id  text;
  v_post_id      text;
  v_cash_id      text;
BEGIN
  SELECT id INTO v_family_id    FROM accounts WHERE user_id = NEW.id AND code = 'family_pool'   LIMIT 1;
  SELECT id INTO v_personal_id  FROM accounts WHERE user_id = NEW.id AND code = 'personal_pool' LIMIT 1;
  SELECT id INTO v_post_id      FROM accounts WHERE user_id = NEW.id AND code = 'post_office'   LIMIT 1;
  SELECT id INTO v_cash_id      FROM accounts WHERE user_id = NEW.id AND code = 'cash_wallet'   LIMIT 1;

  INSERT INTO dashboard_plates (user_id, name, description, linked_account_ids, sort_order)
  SELECT NEW.id, v.name, v.description, v.linked_account_ids, v.sort_order
  FROM (VALUES
    ('家庭', '家庭日常開銷與兒童補助專款',
       ARRAY[v_family_id, v_post_id]::text[], 0),
    ('個人', '個人薪資、日常消費與訂閱',
       ARRAY[v_personal_id]::text[], 1),
    ('現金', '口袋零用、夜市與早餐',
       ARRAY[v_cash_id]::text[], 2)
  ) AS v(name, description, linked_account_ids, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM dashboard_plates WHERE user_id = NEW.id
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed dashboard_plates (pool architecture) failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION on_auth_user_seed_dashboard_plates() OWNER TO postgres;


-- ==============================================================
-- 驗證指令（跑完手動貼到 SQL Editor 對結果）:
--
-- (A) 欄位 + 約束生效
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'accounts' AND column_name = 'code';
--   SELECT conname FROM pg_constraint WHERE conname = 'accounts_code_check';
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'accounts' AND indexname = 'accounts_user_code_unique';
--
-- (B) 每位 user 都有 4 pool
--   SELECT user_id, count(*) FILTER (WHERE code IS NOT NULL) AS pools
--     FROM accounts GROUP BY user_id ORDER BY user_id;
--   -- 每列 pools 必 = 4
--
-- (C) accounts 完整快照
--   SELECT user_id, code, name, type, keywords FROM accounts
--    WHERE code IS NOT NULL ORDER BY user_id, code;
--
-- (D) dashboard_plates 新樣貌
--   SELECT user_id, sort_order, name, description, linked_account_ids
--     FROM dashboard_plates ORDER BY user_id, sort_order;
--   -- 每位 user 應該 3 列：sort 0=家庭(2 ids) / 1=個人(1 id) / 2=現金(1 id)
--
-- (E) categories.default_account_id 對齊 pool
--   SELECT c.user_id, c.code AS cat_code, a.code AS pool_code, a.name
--     FROM categories c
--     LEFT JOIN accounts a ON a.id = c.default_account_id
--    WHERE c.type = 'expense' AND c.code IS NOT NULL
--    ORDER BY c.user_id, c.code;
--   -- home_living/childcare_education/eldercare/finance_insurance -> family_pool
--   -- food_dining/transport/other -> personal_pool
--
-- (F) Trigger 仍掛在 auth.users + function body 已更新
--   SELECT tgname FROM pg_trigger
--    WHERE tgname IN ('on_auth_user_seed_cash_account_trg',
--                     'on_auth_user_seed_dashboard_plates_trg');
--   -- 兩個都應該存在；function body 變了但 trigger 本身不必重建
-- ==============================================================
