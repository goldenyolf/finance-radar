-- ==============================================================
-- Money Radar . 0025 . 砍掉 accounts 表 anon 全開 policy
--
-- 動機（0024 跑完發現）:
--   accounts 表早期存在兩條被遺忘的 policy:
--     1) "anon all accounts" — roles={anon}, USING true, cmd=*
--        → anon role (frontend bundle 內的 anon API key) 可對 accounts
--          表做任何 CRUD 操作，無條件、無 scope by user_id。
--        → 即定時炸彈：任何打開 DevTools 拿到 anon key 的人都能用
--          supabase-js + anon key 對 accounts 表發 UPDATE / DELETE 跨
--          租戶污染。
--     2) "owner_all" — roles=public, USING / WITH CHECK auth.uid() = user_id
--        → 等同 0024 新加的 4 條 policy 的集合版（4-in-1），條件相同。
--          不危險，但冗餘維護。
--
--   0024 加的 4 條 policy 因為 RLS 是 OR 邏輯（任一 policy allow 就過），
--   被 (1) 整個跳過，等於白做工。必須 DROP (1) 才真正生效。
--
-- 修法:
--   - DROP "anon all accounts"          ← 安全修補
--   - DROP "owner_all"                  ← 冗餘清理（跟 0024 完全等價）
--   - 留下 0024 的 4 條 (accounts_select/insert/update/delete)
--
-- 兼容性:
--   - LINE webhook / cron 用 service_role client (per createServiceClient)
--     → bypass RLS，本 migration 0 影響
--   - Web UI 走 user JWT → 命中 0024 的 4 條（auth.uid() = user_id）→ 行為不變
--   - 公開 marketing page 不 query accounts → 不受影響
--
-- 慣例對齊:
--   - DROP POLICY IF EXISTS 可重跑安全
--   - 用雙引號包 "anon all accounts" — 名字含空白必須 quote
--   - ASCII-only header (per memory: SQL Editor pre-parser quirks)
-- ==============================================================


-- --------------------------------------------------------------
-- (1) DROP anon 全開 policy — 安全修補
-- --------------------------------------------------------------

DROP POLICY IF EXISTS "anon all accounts" ON accounts;


-- --------------------------------------------------------------
-- (2) DROP owner_all — 冗餘清理（與 0024 4 條完全等價）
-- --------------------------------------------------------------

DROP POLICY IF EXISTS owner_all ON accounts;


-- ==============================================================
-- 驗證:
--
-- (A) 應該只剩 0024 加的 4 條
--   SELECT polname, polcmd, polroles::regrole[] AS roles,
--          pg_get_expr(polqual, polrelid) AS using_clause
--     FROM pg_policy
--    WHERE polrelid = 'accounts'::regclass
--    ORDER BY polname;
--   -- 預期 4 列：accounts_delete / insert / select / update
--   -- 沒有 "anon all accounts" 或 "owner_all"
--
-- (B) 用 anon key 試一下 (Supabase Dashboard SQL Editor 預設 postgres role
--     拿不到 anon 體驗，要從 frontend devtools console 跑):
--       const { data, error } = await supabase.from('accounts').select('*');
--     → 預期 data = [] 或 error.message 包含 RLS 字樣
--
-- (C) 登入後 web UI 自己的帳戶仍可正常 SELECT/UPDATE
--   （煙霧測試走「校正餘額」dialog 即驗）
-- ==============================================================
