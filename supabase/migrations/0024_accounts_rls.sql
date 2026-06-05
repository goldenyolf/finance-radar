-- ==============================================================
-- Money Radar . 0024 . accounts 表正式啟用 RLS
--
-- 動機（資產校正儀準備）:
--   accounts 表在 0001-0023 全程**都沒有 RLS policy** — 其他關鍵表
--   (wealth_accounts 0004 / dashboard_plates 0007 / profiles 0010) 都有；
--   accounts 是奇怪的漏網。
--
--   過去靠 server-side `service role client` 寫 + `.eq('user_id', ...)`
--   程式碼防線維持租戶隔離。但即將上線的 calibrateAccountBalance Server
--   Action 用 user JWT client + RLS 為主、`.eq` 為輔，必須先把 RLS 補齊。
--
-- 設計（對齊 0007 dashboard_plates 4-policy pattern）:
--   - SELECT  : auth.uid() = user_id
--   - INSERT  : WITH CHECK auth.uid() = user_id
--   - UPDATE  : USING + WITH CHECK 雙條件（防 user_id 被改成別人）
--   - DELETE  : USING auth.uid() = user_id
--   - DROP POLICY IF EXISTS 領頭，可重跑安全
--   - ENABLE ROW LEVEL SECURITY 多跑無害
--   - ASCII-only header (per memory: SQL Editor pre-parser quirks)
--
-- 後續代碼層仍 belt+suspenders 寫 `.eq("user_id", uid)`，per memory:
--   「多租戶 DB UPDATE/DELETE 一律 scope by user_id」雙重保險。
--
-- 影響:
--   服務端有兩條 supabase client:
--     1) createServiceClient (service role) — bypass RLS，LINE webhook /
--        cron 用，影響 0
--     2) createClient (user JWT) — server actions / RSC 用，啟用後將開始
--        受 RLS 約束。既有 actions 全部明確 .eq('user_id', ...) 寫過，
--        理論上不會壞掉
-- ==============================================================


-- --------------------------------------------------------------
-- (1) Enable RLS
-- --------------------------------------------------------------

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------------
-- (2) 4 policies (SELECT / INSERT / UPDATE / DELETE)
-- --------------------------------------------------------------

DROP POLICY IF EXISTS accounts_select ON accounts;
DROP POLICY IF EXISTS accounts_insert ON accounts;
DROP POLICY IF EXISTS accounts_update ON accounts;
DROP POLICY IF EXISTS accounts_delete ON accounts;

CREATE POLICY accounts_select ON accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY accounts_insert ON accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY accounts_update ON accounts
  FOR UPDATE USING (auth.uid() = user_id)
             WITH CHECK (auth.uid() = user_id);

CREATE POLICY accounts_delete ON accounts
  FOR DELETE USING (auth.uid() = user_id);


-- ==============================================================
-- 驗證:
--
-- (A) RLS 啟用
--   SELECT relname, relrowsecurity
--     FROM pg_class WHERE relname = 'accounts';
--   -- relrowsecurity 必為 t
--
-- (B) 4 policy 都在
--   SELECT polname, polcmd
--     FROM pg_policy
--    WHERE polrelid = 'accounts'::regclass
--    ORDER BY polname;
--   -- 應該回 accounts_delete/insert/select/update 共 4 列
--
-- (C) 跨租戶測試（用 dev 兩個 user）:
--   假登入 user A，SELECT * FROM accounts — 只該看到自己的 row。
--   嘗試 UPDATE 別 user 的 row — 應該回 "no rows affected"（被 RLS 擋）。
-- ==============================================================
