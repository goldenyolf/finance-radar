-- ──────────────────────────────────────────────────────────────
-- Money Radar · 0004 · 淨資產 / 財富管理模組
--
-- 兩張新表：
--   wealth_accounts    : 使用者自訂的「財富帳戶」buckets（台股、美股 ETF、房貸…）
--                        只記元資料，不存當下市值。
--   wealth_snapshots   : 月度資產快照，定期手動更新。trend chart 從這裡撈。
--                        net_worth 是 GENERATED column，算術強制一致。
--
-- 全部 IF (NOT) EXISTS / DROP IF EXISTS + CREATE，可重複執行 (idempotent)。
-- 刻意不用 DO block + dollar-quote — Supabase SQL Editor 把整段包進
-- transaction 時，DO block 失敗會把整支 migration rollback，踩過一次了。
-- ──────────────────────────────────────────────────────────────

-- ╭──────────────────────────────────────────────╮
-- │ 1. wealth_accounts                           │
-- ╰──────────────────────────────────────────────╯

CREATE TABLE IF NOT EXISTS wealth_accounts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL DEFAULT auth.uid()
              REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- type 只允許 asset / liability（snake_case，跟全專案 enum 一致）
ALTER TABLE wealth_accounts
  DROP CONSTRAINT IF EXISTS wealth_accounts_type_check;

ALTER TABLE wealth_accounts
  ADD CONSTRAINT wealth_accounts_type_check
  CHECK (type IN ('asset', 'liability'));

CREATE INDEX IF NOT EXISTS wealth_accounts_user_id_idx
  ON wealth_accounts (user_id, sort_order);


-- ╭──────────────────────────────────────────────╮
-- │ 2. wealth_snapshots                          │
-- ╰──────────────────────────────────────────────╯

CREATE TABLE IF NOT EXISTS wealth_snapshots (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID          NOT NULL DEFAULT auth.uid()
                     REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at        DATE          NOT NULL,
  total_assets       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_liabilities  NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- 算術強制一致：應用層改不到，永遠 = 總資產 − 總負債
  net_worth          NUMERIC(14,2) GENERATED ALWAYS AS
                     (total_assets - total_liabilities) STORED,
  -- 各 wealth_account 當下殘值的 array 快照，shape:
  --   [{ "account_id": "uuid", "name": "台股部位", "type": "asset", "value": 123456.78 }, ...]
  details            JSONB         NOT NULL DEFAULT '[]'::jsonb,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- 同一使用者同一天只能有一筆 → 同日 re-submit 走 UPSERT 覆蓋
ALTER TABLE wealth_snapshots
  DROP CONSTRAINT IF EXISTS wealth_snapshots_user_date_unique;

ALTER TABLE wealth_snapshots
  ADD CONSTRAINT wealth_snapshots_user_date_unique
  UNIQUE (user_id, recorded_at);

-- 趨勢圖主要查詢：WHERE user_id = ? ORDER BY recorded_at DESC
CREATE INDEX IF NOT EXISTS wealth_snapshots_user_date_idx
  ON wealth_snapshots (user_id, recorded_at DESC);


-- ╭──────────────────────────────────────────────╮
-- │ 3. RLS — 多租戶隔離（跟 transactions 同款）   │
-- ╰──────────────────────────────────────────────╯

ALTER TABLE wealth_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wealth_snapshots ENABLE ROW LEVEL SECURITY;

-- wealth_accounts 4 policy
DROP POLICY IF EXISTS wealth_accounts_select ON wealth_accounts;
DROP POLICY IF EXISTS wealth_accounts_insert ON wealth_accounts;
DROP POLICY IF EXISTS wealth_accounts_update ON wealth_accounts;
DROP POLICY IF EXISTS wealth_accounts_delete ON wealth_accounts;

CREATE POLICY wealth_accounts_select ON wealth_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY wealth_accounts_insert ON wealth_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY wealth_accounts_update ON wealth_accounts
  FOR UPDATE USING (auth.uid() = user_id)
             WITH CHECK (auth.uid() = user_id);

CREATE POLICY wealth_accounts_delete ON wealth_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- wealth_snapshots 4 policy
DROP POLICY IF EXISTS wealth_snapshots_select ON wealth_snapshots;
DROP POLICY IF EXISTS wealth_snapshots_insert ON wealth_snapshots;
DROP POLICY IF EXISTS wealth_snapshots_update ON wealth_snapshots;
DROP POLICY IF EXISTS wealth_snapshots_delete ON wealth_snapshots;

CREATE POLICY wealth_snapshots_select ON wealth_snapshots
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY wealth_snapshots_insert ON wealth_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY wealth_snapshots_update ON wealth_snapshots
  FOR UPDATE USING (auth.uid() = user_id)
             WITH CHECK (auth.uid() = user_id);

CREATE POLICY wealth_snapshots_delete ON wealth_snapshots
  FOR DELETE USING (auth.uid() = user_id);


-- ╭──────────────────────────────────────────────╮
-- │ 4. updated_at auto-touch trigger             │
-- │   只給 wealth_accounts；snapshots 是只追加歷史記錄不該被改  │
-- ╰──────────────────────────────────────────────╯

CREATE OR REPLACE FUNCTION wealth_accounts_set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS wealth_accounts_updated_at_trg ON wealth_accounts;

CREATE TRIGGER wealth_accounts_updated_at_trg
  BEFORE UPDATE ON wealth_accounts
  FOR EACH ROW
  EXECUTE FUNCTION wealth_accounts_set_updated_at();


-- ──────────────────────────────────────────────────────────────
-- Phase 1 完成。
--
-- 下一步建議：到 Supabase Dashboard → SQL Editor 整段貼上後執行。
-- 沒報 ERROR 就是過了；之後可以用 select * from pg_policies where
-- tablename in ('wealth_accounts','wealth_snapshots') 驗證 8 條 policy。
-- ──────────────────────────────────────────────────────────────
