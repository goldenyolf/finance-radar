-- ==============================================================
-- Money Radar . 0016 . 預算警報狀態表 (LINE Push 去重)
--
-- 動機：
--   runBudgetAlerts() 在每筆 expense 寫入後檢查門檻，命中就要打 LINE
--   push。但門檻一旦跌破，後續每筆消費都會再次命中 → 用戶會被洗版。
--   用「狀態表 + UNIQUE 約束」做去重：同 user_id × alert_type × period
--   只允許一筆 row，INSERT 衝突 = 此 period 已警報過、skip 推送。
--
-- alert_period 的格式依 alert_type 不同：
--   - low_remaining: 'YYYY-MM' (本月剩餘率跌破門檻一次警報)
--   - daily_burst:   'YYYY-MM-DD' (單日熔斷一次警報)
--
-- 設計重點：
--   a) FK 到 auth.users + ON DELETE CASCADE — 用戶刪除時連帶清掉
--   b) UNIQUE (user_id, alert_type, alert_period) — 去重核心
--   c) payload JSONB — 留 context 給之後 audit / 補推 / 通知中心顯示
--   d) RLS 4 條 policy 對齊既有業務表（select/insert/delete；update 不開）
--   e) idempotent — DROP CONSTRAINT/POLICY IF EXISTS 後重建，可重跑
-- ==============================================================


-- --------------------------------------------------------------
-- (1) Table
-- --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS budget_alerts (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL
               REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type   TEXT         NOT NULL,
  alert_period TEXT         NOT NULL,
  triggered_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  payload      JSONB        NOT NULL DEFAULT '{}'::jsonb
);

-- alert_type 只允許兩值（per spec 場景 A / B）
ALTER TABLE budget_alerts
  DROP CONSTRAINT IF EXISTS budget_alerts_type_check;

ALTER TABLE budget_alerts
  ADD CONSTRAINT budget_alerts_type_check
  CHECK (alert_type IN ('low_remaining', 'daily_burst'));


-- --------------------------------------------------------------
-- (2) UNIQUE 去重 — 核心約束
-- --------------------------------------------------------------

ALTER TABLE budget_alerts
  DROP CONSTRAINT IF EXISTS budget_alerts_unique;

ALTER TABLE budget_alerts
  ADD CONSTRAINT budget_alerts_unique
  UNIQUE (user_id, alert_type, alert_period);


-- --------------------------------------------------------------
-- (3) Index — 通知中心 / audit 查詢用
-- --------------------------------------------------------------

CREATE INDEX IF NOT EXISTS budget_alerts_user_triggered_idx
  ON budget_alerts (user_id, triggered_at DESC);


-- --------------------------------------------------------------
-- (4) RLS — 跟業務表同款 4 policy
--     INSERT 開給 user 本人是為了 server action (authenticated client)
--     能在自己 user_id 下寫入；webhook 走 service role 繞過 RLS 不受影響。
-- --------------------------------------------------------------

ALTER TABLE budget_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_alerts_select ON budget_alerts;
DROP POLICY IF EXISTS budget_alerts_insert ON budget_alerts;
DROP POLICY IF EXISTS budget_alerts_delete ON budget_alerts;

CREATE POLICY budget_alerts_select ON budget_alerts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY budget_alerts_insert ON budget_alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY budget_alerts_delete ON budget_alerts
  FOR DELETE USING (auth.uid() = user_id);
-- 不開 UPDATE：警報是「歷史事件」，發生就不可改；要清就刪整筆。


-- ==============================================================
-- 驗證指令：
--
-- (A) 表 + 約束
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'budget_alerts';
--
--   SELECT conname, contype, pg_get_constraintdef(oid)
--     FROM pg_constraint WHERE conrelid = 'budget_alerts'::regclass;
--
-- (B) 試插 dry-run 確認 UNIQUE 生效
--   INSERT INTO budget_alerts (user_id, alert_type, alert_period)
--   VALUES (auth.uid(), 'low_remaining', '2026-06');
--   -- 第一次成功；第二次同 params 報 23505 unique violation = OK
--
-- (C) RLS policy 數量
--   SELECT policyname FROM pg_policies WHERE tablename = 'budget_alerts';
--   -- 應該看到 3 條：select / insert / delete
-- ==============================================================
