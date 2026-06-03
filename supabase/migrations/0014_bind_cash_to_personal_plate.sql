-- ==============================================================
-- Money Radar . 0014 . 把現金錢包自動綁進「個人財務」板塊
--
-- 動機：
--   0012 為每個 user seed 現金錢包帳戶；0013 把 plate 升級成 N:1
--   multi-binding。但兩條 migration 之間留了個縫：既有 user 的板塊
--   不會自動把 cash 帳戶綁進去，導致現金錢包雖然存在卻在首頁完全
--   沒露臉（boardData 不含 cash → 資產整合看板的子帳戶 list 看不到）。
--
-- 修法：
--   1) Backfill 既有 user 的「個人財務」plate，append cash 帳戶 id。
--   2) CREATE OR REPLACE 0007 的 dashboard_plates seed trigger function，
--      未來新會員註冊時自動把 cash 帳戶綁進「個人財務」plate (sort_order=2)。
--      ► trigger 觸發順序保證：on_auth_user_seed_cash_account_trg 字母序
--        在 on_auth_user_seed_dashboard_plates_trg 之前（'c' < 'd'），
--        AFTER INSERT 同 event 按 trigger 名字母序執行 — 所以 plates
--        trigger 執行時 cash 帳戶 100% 已存在。
--
-- 設計重點：
--   a) Backfill 用 array_append + NOT (cash_id = ANY(...)) 防重複，可重跑安全。
--   b) Trigger function 既有名稱不變（on_auth_user_seed_dashboard_plates），
--      CREATE OR REPLACE 重新定義 body 即可；既有 trigger 自動吃新邏輯。
--   c) 「個人財務」是 0007 seed 的固定 name，user 若改過名就跳過 backfill。
--   d) ASCII-only header (per Supabase SQL Editor pre-parser quirks)。
--      用 AS $fn$ ... $fn$ dollar-quote 而非 DO block，避開既知地雷。
-- ==============================================================


-- --------------------------------------------------------------
-- (1) Backfill 既有 user 的「個人財務」plate
--     append cash 帳戶 id，已含則 skip。可重跑。
-- --------------------------------------------------------------

UPDATE dashboard_plates p
   SET linked_account_ids = array_append(p.linked_account_ids, c.id)
  FROM accounts c
 WHERE c.user_id = p.user_id
   AND c.type = 'cash'
   AND p.name = '個人財務'
   AND NOT (c.id = ANY(p.linked_account_ids));


-- --------------------------------------------------------------
-- (2) CREATE OR REPLACE dashboard_plates seed trigger function
--     新會員註冊時，「個人財務」plate 自動帶 cash 帳戶。
-- --------------------------------------------------------------

CREATE OR REPLACE FUNCTION on_auth_user_seed_dashboard_plates()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $fn$
DECLARE
  v_cash_id text;
BEGIN
  -- 取此 user 的現金錢包 id (cash_account trigger 字母序在前，必已存在)
  SELECT id INTO v_cash_id
    FROM accounts
   WHERE user_id = NEW.id
     AND type = 'cash'
   LIMIT 1;

  INSERT INTO dashboard_plates (user_id, name, description, linked_account_ids, sort_order)
  SELECT NEW.id, v.name, v.description, v.linked_account_ids, v.sort_order
  FROM (VALUES
    ('家庭財務', '共同帳戶：房貸、托育、學費、子女花費', '{}'::text[], 0),
    ('補助金流', '幼兒補助與被動收入專戶', '{}'::text[], 1),
    ('個人財務', '個人薪資、生活開銷與向共同戶的固定轉出',
       CASE WHEN v_cash_id IS NULL THEN '{}'::text[] ELSE ARRAY[v_cash_id] END, 2)
  ) AS v(name, description, linked_account_ids, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM dashboard_plates WHERE user_id = NEW.id
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed dashboard_plates failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION on_auth_user_seed_dashboard_plates() OWNER TO postgres;


-- ==============================================================
-- 驗證指令：
--
-- (A) 既有 user 的「個人財務」plate 是否吃到 cash 帳戶
--   SELECT p.user_id, p.name, p.linked_account_ids,
--          cardinality(p.linked_account_ids) AS n
--     FROM dashboard_plates p
--    WHERE p.name = '個人財務'
--    ORDER BY p.user_id;
--   -- 應該每列 n >= 1（原綁定 0 或 1 個的話，現在 +1 變 1 或 2）
--
-- (B) 對齊驗證：個人財務 plate.linked_account_ids 內有 cash 帳戶 id
--   SELECT p.user_id, p.linked_account_ids, c.id AS cash_id, c.name AS cash_name
--     FROM dashboard_plates p
--    JOIN accounts c ON c.user_id = p.user_id AND c.type = 'cash'
--    WHERE p.name = '個人財務';
--   -- 應該每列 cash_id 都已包在 linked_account_ids 內
-- ==============================================================
