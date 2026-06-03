-- ==============================================================
-- Money Radar . 0015 . 週期性收支「預估佔位 + 實記核銷」雙態
--
-- 動機：
--   現行 recurring_payments 是「設定模板」，到期僅在 forecast 視角呈現，
--   不會落地成 transactions。當月扣款日到了：
--     - 首頁預算計算抓不到 → 預算反而看起來「沒花到」變寬鬆
--     - LINE 補繳真實金額 (e.g. 大寶月費 11200 vs 模板 10000) 沒地方撞配
--       → 變成多一筆無關聯的新交易，重複扣兩次
--   方案：到期當天 materialize 一筆 placeholder 交易進 transactions，金額用
--   recurring.amount 模板值。LINE / UI 之後可把 placeholder 改成 confirmed
--   並覆蓋實際金額。
--
-- 設計重點：
--   a) 兩個新欄位都 NULL 表示「跟 recurring 無關的一般交易」(舊資料零變動)。
--      只有從 recurring materialize 出來的才填 recurring_payment_id +
--      fulfillment_state='placeholder'。
--   b) recurring_period TEXT (YYYY-MM) 顯式儲存所屬週期，配 UNIQUE 防止同
--      一個 recurring 在同月份被 materialize 兩次。改用 generated column
--      可以更乾淨但 PG GENERATED 對 date 操作要 IMMUTABLE，不想踩這雷。
--   c) materialize_due_recurrings() 用 SECURITY DEFINER + auth.uid()，
--      authenticated client 直接 RPC call 就有效，不需要傳 user_id 參數。
--   d) ON CONFLICT DO NOTHING 處理重複插入；FOUND 不可靠用 GET DIAGNOSTICS。
--   e) 全程 IF (NOT) EXISTS / CREATE OR REPLACE，idempotent 可重跑。
--      避開 DO block + dollar-quote (per 0004 教訓)；只用 ALTER TABLE + 函式定義。
-- ==============================================================


-- --------------------------------------------------------------
-- (1) transactions 加兩個新欄位
-- --------------------------------------------------------------

-- recurring_payments.id 是 TEXT 不是 UUID (per memory「accounts_id_is_text」
-- 的兄弟雷 — 本專案多張表 id 都走 TEXT 不走 UUID)，FK 必須對齊型別否則
-- PG 報 42804 incompatible types。
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS recurring_payment_id TEXT
    REFERENCES recurring_payments(id) ON DELETE SET NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS fulfillment_state TEXT;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_fulfillment_state_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_fulfillment_state_check
  CHECK (fulfillment_state IS NULL
      OR fulfillment_state IN ('placeholder', 'confirmed'));

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS recurring_period TEXT;
-- 格式 'YYYY-MM' — caller 端 / materialize fn 寫入；查詢用 (id, period) 過濾。


-- --------------------------------------------------------------
-- (2) 同 recurring 同月份不能 materialize 兩次
--     partial unique index — 只約束有 recurring_payment_id 的 row，
--     一般手動建立的交易（兩欄都 NULL）不受影響。
-- --------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS transactions_recurring_period_unique
  ON transactions (recurring_payment_id, recurring_period)
  WHERE recurring_payment_id IS NOT NULL
    AND recurring_period IS NOT NULL;


-- --------------------------------------------------------------
-- (3) materialize_due_recurrings() — 把該 user 所有過期的 recurring 落地
--
-- 行為：
--   For each recurring_payment.next_due_date <= current_date :
--     - INSERT 一筆 placeholder transaction (status=completed, state=placeholder)
--     - 推進 next_due_date 一個 cycle (依 frequency)
--   ON CONFLICT 已存在的 (recurring_id, period) 直接 skip，重跑安全。
--
-- 回傳：新 materialize 的筆數（給 caller 做 telemetry / 通知）。
-- --------------------------------------------------------------

CREATE OR REPLACE FUNCTION materialize_due_recurrings()
  RETURNS INTEGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $fn$
DECLARE
  v_user_id UUID;
  v_inserted INTEGER := 0;
  v_period TEXT;
  v_next_date DATE;
  r RECORD;
  rows_inserted INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id, account_id, title, amount, type, category, frequency, next_due_date
      FROM recurring_payments
     WHERE user_id = v_user_id
       AND next_due_date <= current_date
  LOOP
    v_period := to_char(r.next_due_date, 'YYYY-MM');

    INSERT INTO transactions (
      user_id, account_id, description, amount, type, priority, category,
      status, date, recurring_payment_id, fulfillment_state, recurring_period
    )
    VALUES (
      v_user_id,
      r.account_id,
      r.title,
      r.amount,
      r.type,
      CASE WHEN r.type = 'income' THEN 'non_essential' ELSE 'essential' END,
      r.category,
      'completed',
      r.next_due_date,
      r.id,
      'placeholder',
      v_period
    )
    -- partial unique index 必須在 ON CONFLICT 重複指定 WHERE 子句，
    -- 否則 PG 42P10「no unique or exclusion constraint matching」
    ON CONFLICT (recurring_payment_id, recurring_period)
      WHERE recurring_payment_id IS NOT NULL AND recurring_period IS NOT NULL
      DO NOTHING;

    GET DIAGNOSTICS rows_inserted = ROW_COUNT;
    v_inserted := v_inserted + rows_inserted;

    -- 推進 next_due_date 一個週期
    v_next_date := CASE r.frequency
      WHEN 'daily'         THEN (r.next_due_date + INTERVAL '1 day')::date
      WHEN 'weekly'        THEN (r.next_due_date + INTERVAL '7 days')::date
      WHEN 'biweekly'      THEN (r.next_due_date + INTERVAL '14 days')::date
      WHEN 'monthly'       THEN (r.next_due_date + INTERVAL '1 month')::date
      WHEN 'quarterly'     THEN (r.next_due_date + INTERVAL '3 months')::date
      WHEN 'semi_annually' THEN (r.next_due_date + INTERVAL '6 months')::date
      WHEN 'yearly'        THEN (r.next_due_date + INTERVAL '1 year')::date
      ELSE r.next_due_date
    END;

    -- 注意：scope by user_id 雙保險（per memory 多租戶寫操作鐵則）
    UPDATE recurring_payments
       SET next_due_date = v_next_date
     WHERE id = r.id
       AND user_id = v_user_id;
  END LOOP;

  RETURN v_inserted;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'materialize_due_recurrings failed for user %: %', v_user_id, SQLERRM;
  RETURN 0;
END;
$fn$;

ALTER FUNCTION materialize_due_recurrings() OWNER TO postgres;

-- 允許 authenticated role 呼叫（anonymous 不行，auth.uid() 會 NULL）
GRANT EXECUTE ON FUNCTION materialize_due_recurrings() TO authenticated;


-- ==============================================================
-- 驗證指令：
--
-- (A) 欄位 + index 都建好
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'transactions'
--      AND column_name IN ('recurring_payment_id','fulfillment_state','recurring_period');
--
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'transactions'
--      AND indexname = 'transactions_recurring_period_unique';
--
-- (B) Function 存在 + 簽章
--   SELECT proname, pronargs, prorettype::regtype
--     FROM pg_proc WHERE proname = 'materialize_due_recurrings';
--
-- (C) Dry run（必須登入 → auth.uid() 才有值）
--   SELECT materialize_due_recurrings();
--   -- 第一次跑會把所有過期 recurring 落地 + 推進 next_due_date
--   -- 立即再跑一次應該回 0（沒新東西到期 + UNIQUE 防重）
--
-- (D) 看 materialize 出來的 placeholder
--   SELECT id, date, description, amount, recurring_payment_id, fulfillment_state
--     FROM transactions
--    WHERE fulfillment_state = 'placeholder'
--    ORDER BY date DESC;
-- ==============================================================
