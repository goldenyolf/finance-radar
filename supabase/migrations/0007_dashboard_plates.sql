-- ──────────────────────────────────────────────────────────────
-- Money Radar · 0007 · dashboard_plates（使用者自訂戰情室板塊）
--
-- 取代原本寫死的 BoardKey enum (personal | family | subsidy) — 改成讓
-- 使用者自由新增 / 刪除 / 命名「板塊」，每個板塊可選擇綁定一個 accounts.id。
--
-- 本 migration 只建表 + 種子，**首頁實際讀取改用 plates 的重構是另一個 epic**
-- （Phase 3 之後）。這 phase 跑完不會改變現有首頁行為。
--
-- 全部 idempotent；刻意不用 DO block 避開 Supabase SQL Editor 的
-- dollar-quote + transaction rollback 地雷。
-- ──────────────────────────────────────────────────────────────

-- (1) Table + index
CREATE TABLE IF NOT EXISTS dashboard_plates (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL DEFAULT auth.uid()
                     REFERENCES auth.users(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  description        TEXT        NOT NULL DEFAULT '',
  -- 帳戶刪掉時這欄自動置 NULL（板塊本身保留，UI 顯示「未綁定」）
  -- 注意：accounts.id 是 TEXT 不是 UUID（雖然存的是 UUID 字串）—
  -- PG 強制 FK 兩邊型別一致，所以這欄也要 TEXT
  linked_account_id  TEXT
                     REFERENCES accounts(id) ON DELETE SET NULL,
  sort_order         INTEGER     NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_plates_user_sort_idx
  ON dashboard_plates (user_id, sort_order);


-- (2) RLS — 多租戶隔離，跟 wealth_accounts / categories 同款 4 policy
ALTER TABLE dashboard_plates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_plates_select ON dashboard_plates;
DROP POLICY IF EXISTS dashboard_plates_insert ON dashboard_plates;
DROP POLICY IF EXISTS dashboard_plates_update ON dashboard_plates;
DROP POLICY IF EXISTS dashboard_plates_delete ON dashboard_plates;

CREATE POLICY dashboard_plates_select ON dashboard_plates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY dashboard_plates_insert ON dashboard_plates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY dashboard_plates_update ON dashboard_plates
  FOR UPDATE USING (auth.uid() = user_id)
             WITH CHECK (auth.uid() = user_id);

CREATE POLICY dashboard_plates_delete ON dashboard_plates
  FOR DELETE USING (auth.uid() = user_id);


-- (3) updated_at auto-touch trigger
CREATE OR REPLACE FUNCTION dashboard_plates_set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS dashboard_plates_updated_at_trg ON dashboard_plates;

CREATE TRIGGER dashboard_plates_updated_at_trg
  BEFORE UPDATE ON dashboard_plates
  FOR EACH ROW
  EXECUTE FUNCTION dashboard_plates_set_updated_at();


-- (4) 種子函式 — idempotent（已有任何板塊就跳過，不重複塞）
CREATE OR REPLACE FUNCTION seed_default_dashboard_plates(uid UUID)
  RETURNS VOID
  LANGUAGE plpgsql
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM dashboard_plates WHERE user_id = uid) THEN
    RETURN;
  END IF;
  INSERT INTO dashboard_plates (user_id, name, description, sort_order) VALUES
    (uid, '家庭財務', '共同帳戶：房貸、托育、學費、子女花費',         0),
    (uid, '補助金流', '幼兒補助與被動收入專戶',                       1),
    (uid, '個人財務', '個人薪資、生活開銷與向共同戶的固定轉出',         2);
END;
$fn$;


-- (5) 新會員 sign-up trigger
--     另開一個獨立 trigger（不去改使用者既有的 categories seed trigger），
--     additive 不破壞既有邏輯。SECURITY DEFINER 因為 auth.users 上的 trigger
--     需要繞過 RLS 寫入 dashboard_plates。
CREATE OR REPLACE FUNCTION on_auth_user_seed_dashboard_plates()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $fn$
BEGIN
  PERFORM seed_default_dashboard_plates(NEW.id);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_auth_user_seed_dashboard_plates_trg ON auth.users;

CREATE TRIGGER on_auth_user_seed_dashboard_plates_trg
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION on_auth_user_seed_dashboard_plates();


-- (6) Backfill 既有用戶：用 CROSS JOIN + NOT EXISTS 一條 SQL 解決（避開 DO block）
--     已有任何板塊的 user 整段 skip；新 user 一次塞 3 條。
INSERT INTO dashboard_plates (user_id, name, description, sort_order)
SELECT u.id, v.name, v.description, v.sort_order
FROM auth.users u
CROSS JOIN (VALUES
  ('家庭財務', '共同帳戶：房貸、托育、學費、子女花費',         0),
  ('補助金流', '幼兒補助與被動收入專戶',                       1),
  ('個人財務', '個人薪資、生活開銷與向共同戶的固定轉出',         2)
) AS v(name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_plates p WHERE p.user_id = u.id
);


-- ──────────────────────────────────────────────────────────────
-- 驗證：
--   SELECT id, name, description, sort_order, linked_account_id
--   FROM dashboard_plates ORDER BY sort_order;
-- 應該看到你帳號的 3 條種子板塊。
-- ──────────────────────────────────────────────────────────────
