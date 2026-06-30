-- ==============================================================
-- Money Radar . 0028 . transactions.project_tag 重大專案隔離防線
--
-- 動機:
--   太太醫療 / 新居家電 / 大額轉帳這類非經常性「重大專案」一旦混進日常
--   分類圓餅、Sankey、財務彈性，會把月度健康指標整個拉歪。需要一個能
--   現場切換的全域過濾原子 — 「主圖只顯示日常柴米油鹽」vs「全景含大額」。
--
--   不走 boolean is_outlier，因為一筆 50K 的家電跟 200K 的住院費，使用者
--   想看的標籤維度不同 — 用 freeform text 讓使用者自取 ('太太醫療' /
--   '新居家電' / '長照支援' …)，UI 端 group_by tag 列出歸檔。
--
-- 設計:
--   a) project_tag TEXT NULL — freeform 不上 CHECK，給使用者自由命名。
--      多數交易為 null = 「日常」。LINE bot / Quick Add / 編輯 dialog
--      之後可以擴成下拉選 + 新增標籤的 combobox，本 migration 不動。
--   b) RLS 一併補齊：transactions 表先前靠 .eq('user_id', ...) 程式碼防
--      線維持多租戶隔離（accounts 0024 已補完 RLS，transactions 還沒）。
--      新欄位上線是補齊的好時機 — 跟 0024 同款 4-policy pattern。
--   c) idempotent（ADD COLUMN IF NOT EXISTS + DROP POLICY IF EXISTS）
--      可重跑安全；ASCII-only header 對齊 SQL Editor pre-parser quirk。
--
-- 影響範圍:
--   - loadDashboard() 的 `transactions.select("*")` 自動把新欄位帶回前端。
--   - 分析頁的「重大專案隔離模式」switch 直接吃 project_tag IS NOT NULL
--     做 client-side filter，無 SSR / API 額外 round-trip。
--   - 既有 server actions 都明確 .eq("user_id", uid)，啟用 RLS 不會壞。
-- ==============================================================


-- --------------------------------------------------------------
-- (1) 加新欄位
-- --------------------------------------------------------------

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS project_tag TEXT;


-- --------------------------------------------------------------
-- (2) 索引 — 之後若 SQL WHERE project_tag IS NOT NULL 變熱路徑可加
--     partial index。目前 client-side filter，不先加避免 over-engineer。
-- --------------------------------------------------------------

-- (intentionally left blank — see note above)


-- --------------------------------------------------------------
-- (3) RLS — 對齊 0024 accounts_* 4-policy pattern
--
--   transactions 在 0001-0027 沒寫過 CREATE POLICY，雖然多租戶靠
--   .eq('user_id', uid) 程式碼層防線而 dev 沒翻車，但新功能上線是補齊的
--   好時機。pattern 跟 accounts 完全一致：
--     - SELECT  : auth.uid() = user_id
--     - INSERT  : WITH CHECK auth.uid() = user_id
--     - UPDATE  : USING + WITH CHECK 雙條件（防 user_id 被改成別人）
--     - DELETE  : USING auth.uid() = user_id
-- --------------------------------------------------------------

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transactions_select ON transactions;
DROP POLICY IF EXISTS transactions_insert ON transactions;
DROP POLICY IF EXISTS transactions_update ON transactions;
DROP POLICY IF EXISTS transactions_delete ON transactions;

CREATE POLICY transactions_select ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY transactions_insert ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY transactions_update ON transactions
  FOR UPDATE USING (auth.uid() = user_id)
                 WITH CHECK (auth.uid() = user_id);

CREATE POLICY transactions_delete ON transactions
  FOR DELETE USING (auth.uid() = user_id);


-- ==============================================================
-- 驗證指令（SQL Editor 跑，用 explicit UUID per memory sql_editor_auth_uid_null）:
--
-- (A) 欄位存在
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'transactions'
--      AND column_name = 'project_tag';
--   -- text / YES
--
-- (B) RLS 已啟用
--   SELECT relname, relrowsecurity
--     FROM pg_class
--    WHERE relname = 'transactions';
--   -- relrowsecurity = t
--
-- (C) 4 policy 都在
--   SELECT polname, polcmd
--     FROM pg_policy
--    WHERE polrelid = 'transactions'::regclass
--    ORDER BY polname;
--   -- transactions_delete / insert / select / update
--
-- (D) 試標記一筆 + 跨租戶檢查（用 dev 第二個 user 的 jwt 拉 SELECT 應該 0 列）
--   UPDATE transactions
--      SET project_tag = '太太醫療'
--    WHERE id = '<your-tx-uuid>'
--      AND user_id = '<your-user-uuid>';
-- ==============================================================
