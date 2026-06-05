-- ==============================================================
-- Money Radar . 0022 . family_pool.keywords 補 spec 明指的家庭詞
--
-- 動機（UAT 第二輪 LINE 煙霧測試）:
--   「家庭買菜 500」「水電費 1850」應落 family_pool，實際全進 cash_wallet。
--   攔截器命中失敗（family_pool.keywords 沒含「家庭」「水電」），LLM 又因
--   Rule F 默認 pm=cash 觸發 resolveTargetAccount cash 短路 → 兜回現金錢包。
--
--   本 migration 處理 keywords 部分（LLM prompt + webhook 邏輯另檔修）。
--
-- 對應 spec 字面:
--   屬於家庭分類（家庭、水電、育兒、公務採買）-> family_pool
--   把這 4 個明指詞補進 family_pool.keywords，讓攔截器層直接命中
--   (priority 1 高於 LLM 分類路由)，繞過 LLM 對「家庭買菜」可能誤判成
--   food_dining 的風險。
--
-- 設計:
--   a) 直接覆寫 family_pool.keywords（spec 完整列表覆寫舊版）— 沒人手動
--      改過（UI 尚未開放），idempotent 結果相同
--   b) CREATE OR REPLACE 0020 trigger fn 讓新會員拿到完整 keywords
--   c) ASCII-only header (per memory: SQL Editor pre-parser quirks)
-- ==============================================================


-- --------------------------------------------------------------
-- (1) UPDATE 既有 family_pool.keywords
--     原: ['台新', '台新銀行', '家庭公庫', '公庫']
--     新: 加入 spec 明指的 '家庭' '水電' '育兒' '公務' 4 個
-- --------------------------------------------------------------

UPDATE accounts
   SET keywords = ARRAY['台新', '台新銀行', '家庭公庫', '公庫',
                        '家庭', '水電', '育兒', '公務']
 WHERE code = 'family_pool';


-- --------------------------------------------------------------
-- (2) CREATE OR REPLACE trigger fn -> 新會員 keywords 同步
--     CREATE OR REPLACE 0020 的 on_auth_user_seed_cash_account()
--     只改 family_pool 那列的 keywords，其餘 3 pool 保留不動。
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
    ('家庭公庫', 'bank', 'family_pool',
       ARRAY['台新', '台新銀行', '家庭公庫', '公庫', '家庭', '水電', '育兒', '公務']),
    ('個人零用', 'bank', 'personal_pool',
       ARRAY['中信', '中國信託', '個人零用']),
    ('郵局專戶', 'bank', 'post_office',
       ARRAY['郵局', '中華郵政', '補助', '幼兒補助']),
    ('隨身現金', 'cash', 'cash_wallet',
       ARRAY['現金', '錢包', '夜市', '早餐'])
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


-- ==============================================================
-- 驗證:
--   SELECT code, keywords FROM accounts
--    WHERE code = 'family_pool' ORDER BY user_id;
--   -- 每 user family_pool keywords 應該 = 8 元素含 '家庭'/'水電'/'育兒'/'公務'
-- ==============================================================
