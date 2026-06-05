-- ==============================================================
-- Money Radar . 0023 . dedupe legacy accounts vs 0020 空殼 pool
--
-- 動機（UAT 發現）:
--   0020 phase 2 RENAME 用 `WHERE name='家庭共同帳戶'` 精準比對只抓某幾種
--   命名格式。User 1c56ddf2 (dream211674@gmail.com) 實際 legacy 帳戶用了
--   別名命名（「生活支出共同帳戶 (台新)」「百五的薪資帳戶 (中信)」「補助
--   收入（郵局）」），RENAME 全部 miss → phase 3 INSERT NOT EXISTS 又補了
--   4 個空 pool → 該 user 變 7 戶（3 legacy 含真實餘額 + 4 空殼 pool）。
--
-- 對應修法（user 自己確認的映射）:
--   acc-taishin  「生活支出共同帳戶 (台新)」   = family_pool   (空殼 f4fdcca8)
--   acc-001      「百五的薪資帳戶 (中信)」     = personal_pool (空殼 9c3d9e74)
--   acc-post     「補助收入（郵局）」          = post_office   (空殼 8d541481)
--   4d03875a     「隨身現金」                  = cash_wallet   (本來就 0020 唯一，留)
--
-- 策略：legacy 接管 — 不動 legacy 的 id（transactions / recurring 全部保留），
--   只把 code/keywords/name 換成 pool 的；先把所有 FK 重定向到 legacy id，
--   再 DELETE 空殼，最後 UPDATE legacy 拿到 code。
--
--   UNIQUE (user_id, code) WHERE code IS NOT NULL 限制：
--   必須先 DELETE 空殼釋放 code，才能 UPDATE legacy 拿那個 code。
--
-- Scope:
--   全程 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'，
--   絕對不跨租戶污染（per memory: 多租戶 UPDATE 強制 scope）。
--
-- 慣例對齊:
--   - ASCII-only header (per memory: SQL Editor pre-parser quirks)
--   - 5 個 FK 表全部 redirect: transactions / recurring_payments /
--     categories.default_account_id / profiles.default_account_id /
--     dashboard_plates.linked_account_ids
--   - dashboard_plates 直接 hardcode 最終 array 而非 array_replace —
--     避免 user 手動 bind 後同時有 pool + legacy 兩個 id 造成 dedupe
--     後出現重複元素
-- ==============================================================


-- --------------------------------------------------------------
-- Phase 1a: transactions 重定向 (空殼 pool id -> legacy id)
--   理論上空殼 pool 剛建沒 transactions，但 UAT 第二輪 LINE 測試後可能有
--   零星 records。defensive UPDATE 處理。
-- --------------------------------------------------------------

UPDATE transactions
   SET account_id = 'acc-taishin'
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND account_id = 'f4fdcca8-5ff5-4d1e-a7ce-3b6061040a94';

UPDATE transactions
   SET account_id = 'acc-001'
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND account_id = '9c3d9e74-5429-492d-8518-f4ff6e48a2d9';

UPDATE transactions
   SET account_id = 'acc-post'
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND account_id = '8d541481-74d8-4802-ae3b-6658f4579049';


-- --------------------------------------------------------------
-- Phase 1b: recurring_payments 重定向
-- --------------------------------------------------------------

UPDATE recurring_payments
   SET account_id = 'acc-taishin'
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND account_id = 'f4fdcca8-5ff5-4d1e-a7ce-3b6061040a94';

UPDATE recurring_payments
   SET account_id = 'acc-001'
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND account_id = '9c3d9e74-5429-492d-8518-f4ff6e48a2d9';

UPDATE recurring_payments
   SET account_id = 'acc-post'
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND account_id = '8d541481-74d8-4802-ae3b-6658f4579049';


-- --------------------------------------------------------------
-- Phase 1c: categories.default_account_id 重定向
--   0020 phase 5 把 family / personal / post category default 指到了
--   空殼 pool id；要 redirect 到 legacy。
-- --------------------------------------------------------------

UPDATE categories
   SET default_account_id = 'acc-taishin'
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND default_account_id = 'f4fdcca8-5ff5-4d1e-a7ce-3b6061040a94';

UPDATE categories
   SET default_account_id = 'acc-001'
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND default_account_id = '9c3d9e74-5429-492d-8518-f4ff6e48a2d9';

UPDATE categories
   SET default_account_id = 'acc-post'
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND default_account_id = '8d541481-74d8-4802-ae3b-6658f4579049';


-- --------------------------------------------------------------
-- Phase 1d: profiles.default_account_id 重定向
-- --------------------------------------------------------------

UPDATE profiles
   SET default_account_id = 'acc-taishin'
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND default_account_id = 'f4fdcca8-5ff5-4d1e-a7ce-3b6061040a94';

UPDATE profiles
   SET default_account_id = 'acc-001'
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND default_account_id = '9c3d9e74-5429-492d-8518-f4ff6e48a2d9';

UPDATE profiles
   SET default_account_id = 'acc-post'
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND default_account_id = '8d541481-74d8-4802-ae3b-6658f4579049';


-- --------------------------------------------------------------
-- Phase 2: dashboard_plates linked_account_ids 重建
--   直接 hardcode 最終 array 而非 array_replace — user 手動 bind 後
--   plate 可能同時有 pool + legacy id，array_replace 會產生重複元素。
--   sort 0 = 家庭 → {acc-taishin, acc-post}
--   sort 1 = 個人 → {acc-001}
--   sort 2 = 現金 → {4d03875a 不動}
-- --------------------------------------------------------------

UPDATE dashboard_plates
   SET linked_account_ids = ARRAY['acc-taishin', 'acc-post']
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND sort_order = 0;

UPDATE dashboard_plates
   SET linked_account_ids = ARRAY['acc-001']
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND sort_order = 1;

-- 現金 plate (sort 2) 已正確綁 4d03875a，免動


-- --------------------------------------------------------------
-- Phase 3: DELETE 3 空殼 pool（FK 已全部 redirect 完）
-- --------------------------------------------------------------

DELETE FROM accounts
 WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
   AND id IN (
     'f4fdcca8-5ff5-4d1e-a7ce-3b6061040a94',
     '9c3d9e74-5429-492d-8518-f4ff6e48a2d9',
     '8d541481-74d8-4802-ae3b-6658f4579049'
   );


-- --------------------------------------------------------------
-- Phase 4: legacy 接管 code / name / keywords
--   UNIQUE (user_id, code) 已在 phase 3 釋放，可安全 UPDATE。
-- --------------------------------------------------------------

UPDATE accounts
   SET name = '家庭公庫',
       code = 'family_pool',
       keywords = ARRAY['台新', '台新銀行', '家庭公庫', '公庫',
                        '家庭', '水電', '育兒', '公務']
 WHERE id = 'acc-taishin'
   AND user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8';

UPDATE accounts
   SET name = '個人零用',
       code = 'personal_pool',
       keywords = ARRAY['中信', '中國信託', '個人零用']
 WHERE id = 'acc-001'
   AND user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8';

UPDATE accounts
   SET name = '郵局專戶',
       code = 'post_office',
       keywords = ARRAY['郵局', '中華郵政', '補助', '幼兒補助']
 WHERE id = 'acc-post'
   AND user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8';


-- ==============================================================
-- 驗證 (跑完手動貼到 SQL Editor 確認):
--
-- (A) 該 user 應該剩 4 戶，4 個 code 都對齊
--   SELECT id, name, type, code, balance
--     FROM accounts
--    WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
--    ORDER BY type, name;
--   -- 預期:
--   --   acc-001         個人零用    bank  personal_pool  22090
--   --   acc-post        郵局專戶    bank  post_office    41592
--   --   acc-taishin     家庭公庫    bank  family_pool    3921
--   --   4d03875a...     隨身現金    cash  cash_wallet    0
--
-- (B) plates 應該 3 列，linked 對齊 legacy id
--   SELECT sort_order, name, linked_account_ids
--     FROM dashboard_plates
--    WHERE user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
--    ORDER BY sort_order;
--   -- 預期:
--   --   0  家庭  {acc-taishin, acc-post}
--   --   1  個人  {acc-001}
--   --   2  現金  {4d03875a...}
--
-- (C) categories default 都指 legacy
--   SELECT c.code AS cat, a.id AS account_id, a.code AS pool, a.name
--     FROM categories c
--     LEFT JOIN accounts a ON a.id = c.default_account_id
--    WHERE c.user_id = '1c56ddf2-deef-431d-8c97-f933e6c277b8'
--      AND c.type = 'expense'
--    ORDER BY c.code;
-- ==============================================================
