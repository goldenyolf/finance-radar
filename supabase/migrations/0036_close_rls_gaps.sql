-- ==============================================================
-- Money Radar . 0036 . 補齊剩餘的 RLS 缺口
--
-- 實測發現（用 anon key 直打 PostgREST，跟 service role 的 count 對比）:
--
--   表名                 service   anon    判定
--   transactions         312       312     外洩
--   users                1         1       外洩
--   recurring_payments   10        10      外洩
--   accounts             8         0       OK (0024 + 0025)
--   dashboard_plates     6         0       OK (0007)
--   profiles             2         0       OK (0010)
--   wealth_accounts      3         0       OK (0004)
--   wealth_snapshots     2         0       OK (0004)
--   budget_alerts        8         0       OK (0016)
--   categories           16        0       OK (repo 外設定過)
--   subscriptions        3         0       OK (repo 外設定過)
--   system_settings      1         0       OK (repo 外設定過)
--   assets / debts / goals / goal_logs     空表，無法判定
--
-- 為什麼 transactions 明明在 0028 開過 RLS 還是外洩:
--   跟 0025 記錄的 accounts 情況一模一樣 —— 早期有一條
--   "anon all accounts" (roles={anon}, USING true, cmd=*) 的遺留 policy。
--   RLS 是 OR 邏輯：任一 policy allow 就放行，所以 0028 加的四條被整個
--   跳過，等於白做工。0025 當時只清了 accounts 這一張。
--
-- 為什麼這裡用 DO 迴圈砍掉「所有」policy 而不是指名砍:
--   遺留 policy 的名字在 repo 裡沒有紀錄（0025 是跑完 0024 才發現才補的），
--   指名 DROP 會漏。這幾張表應該有的 policy 就是下面重建的四條，全砍重建
--   是可判定的終局狀態，不必先知道舊名字。
--
-- 安全性前提（已實測確認）:
--   上述每張表的 user_id 都沒有 NULL 列（users 是 id）。所以開 RLS 之後
--   不會有任何資料因為對不到 auth.uid() 而消失。
--
-- 對既有功能的影響:
--   - LINE webhook / cron 走 service_role client -> bypass RLS，0 影響
--   - Web UI 走 user JWT -> 命中新的四條 (auth.uid() = user_id)，行為不變
--   - users 表是 pre-auth 遺留（0002 seed 用 gen_random_uuid() 建，id 不是
--     auth uid），開 RLS 後那一列對所有人不可見。這是預期結果：應用層已經
--     改成 .eq("id", uid) 查不到它，安全門檻請走 /settings (system_settings)。
--
-- 全部 idempotent，可重複跑。ASCII-only header 對齊 SQL Editor pre-parser。
-- ==============================================================


-- --------------------------------------------------------------
-- (1) 砍掉三張外洩表上的所有既有 policy
--     動態 SQL 是必要的：舊 policy 的名字未知（可能含空白，故 quote_ident）
-- --------------------------------------------------------------

DO $body$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('transactions', 'recurring_payments', 'users')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
  END LOOP;
END
$body$;


-- --------------------------------------------------------------
-- (2) transactions
-- --------------------------------------------------------------

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_select ON transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY transactions_insert ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY transactions_update ON transactions
  FOR UPDATE USING (auth.uid() = user_id)
             WITH CHECK (auth.uid() = user_id);
CREATE POLICY transactions_delete ON transactions
  FOR DELETE USING (auth.uid() = user_id);


-- --------------------------------------------------------------
-- (3) recurring_payments
-- --------------------------------------------------------------

ALTER TABLE recurring_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_payments_select ON recurring_payments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY recurring_payments_insert ON recurring_payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY recurring_payments_update ON recurring_payments
  FOR UPDATE USING (auth.uid() = user_id)
                   WITH CHECK (auth.uid() = user_id);
CREATE POLICY recurring_payments_delete ON recurring_payments
  FOR DELETE USING (auth.uid() = user_id);


-- --------------------------------------------------------------
-- (4) users — 注意 PK 是 id，不是 user_id
--     只給 SELECT / UPDATE：這是 pre-auth 遺留表，應用層不會 insert，
--     刪除應該跟著 auth.users 走 CASCADE。
-- --------------------------------------------------------------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select ON users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY users_update ON users
  FOR UPDATE USING (auth.uid() = id)
             WITH CHECK (auth.uid() = id);


-- --------------------------------------------------------------
-- (5) 目前為空、判定不了的四張表 — 一併補上，關掉未知數
--     空表開 RLS 不可能讓資料消失，成本為零。
--     用 DO + IF NOT EXISTS 檢查，避免重跑時撞 42710 duplicate_object。
-- --------------------------------------------------------------

DO $body$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['assets', 'debts', 'goals', 'goal_logs']
  LOOP
    -- 表不存在就跳過（fork / 不同環境可能沒有 assets / debts）
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t
         AND policyname = t || '_owner_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
        t || '_owner_all', t
      );
    END IF;
  END LOOP;
END
$body$;


-- ==============================================================
-- 驗證:
--
-- (A) 三張表各應該剩下這次建的 policy，沒有 roles={anon} 的全開條目:
--   SELECT tablename, policyname, roles, cmd, qual
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('transactions','recurring_payments','users')
--    ORDER BY tablename, policyname;
--
-- (B) 確認每張表都真的 ENABLE 了:
--   SELECT c.relname, c.relrowsecurity
--     FROM pg_class c
--    WHERE c.relnamespace = 'public'::regnamespace
--      AND c.relkind = 'r'
--    ORDER BY c.relrowsecurity, c.relname;
--
-- (C) 真正的驗收是用 anon key 打 PostgREST 看拿不拿得到列
--     （SQL Editor 是 postgres role，測不出 anon 的體驗）。
--     跑完這支之後請告知，我會重跑一次稽核腳本確認 anon count 歸零。
--
-- (D) 煙霧測試：登入後首頁 / 明細 / 分析三頁數字正常、可新增一筆交易、
--     /recurring 看得到週期項目。
-- ==============================================================
