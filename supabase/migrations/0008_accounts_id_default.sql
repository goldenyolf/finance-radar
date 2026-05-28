-- ──────────────────────────────────────────────────────────────
-- Money Radar · 0008 · accounts.id 補上 DEFAULT gen_random_uuid()::text
--
-- Bug：新會員註冊整個 fail with "Database error saving new user"。
-- Root cause：handle_new_user() trigger 想 seed 3 個預設帳戶：
--   INSERT INTO accounts (user_id, name, type, ...) VALUES (...)
-- 沒帶 id 因為以為有 DEFAULT；但 accounts.id 是 TEXT NOT NULL 且
-- 不知道在哪次 schema 重構 DEFAULT 被搞掉了，導致 INSERT 噴：
--   23502: null value in column "id" of relation "accounts"
-- 整個 transaction rollback → Supabase Auth 回 Database error。
--
-- 修法：把 DEFAULT 加回來。accounts.id 是 TEXT（不是 UUID），所以
-- 用 ::text cast — 跟既有資料型別對齊。
-- ──────────────────────────────────────────────────────────────

ALTER TABLE accounts
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- 驗證：跑完應該看到 column_default = 'gen_random_uuid()::text'
--   SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_name = 'accounts' AND column_name = 'id';
