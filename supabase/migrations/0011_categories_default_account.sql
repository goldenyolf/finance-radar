-- ──────────────────────────────────────────────────────────────
-- Money Radar · 0011 · categories.default_account_id + profiles.default_account_id
--
-- 為 LINE bot 「語意分流與後綴覆蓋規則」鋪 schema 路：
--   account_override (LLM 抽)
--     → categories.default_account_id  (分類層預設帳戶；如「水電」永遠走台新)
--       → profiles.default_account_id   (帳號層主要帳戶 singleton)
--         → accounts created_at 最早一筆 (保底，code-side fallback)
--
-- 設計重點：
--   1) accounts.id 是 TEXT（per migration 0008 / memory 提醒），FK 也必須 TEXT；
--      若用 UUID 會踩 42804 incompatible types。
--   2) ON DELETE SET NULL — 刪帳戶不該連帶把分類偏好或主帳戶設定一起 wipe。
--   3) RLS 既有政策就吃這兩個新欄位（policy 不以欄位為單位），不需要重建。
--   4) idempotent 全程 IF NOT EXISTS，可重複跑。
--
-- 跑完驗證：
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name IN ('categories','profiles')
--     AND column_name = 'default_account_id';
-- ──────────────────────────────────────────────────────────────

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS default_account_id TEXT
    REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_default_account
  ON categories(default_account_id)
  WHERE default_account_id IS NOT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS default_account_id TEXT
    REFERENCES accounts(id) ON DELETE SET NULL;
