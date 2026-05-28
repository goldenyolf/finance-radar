-- ──────────────────────────────────────────────────────────────
-- Money Radar · 0010 · profiles 加個人設定 3 欄位 + RLS update policy
--
-- 補上 personal preferences 三件套：
--   1) display_name        — 首頁歡迎詞 「歡迎回來，[暱稱]！」用
--   2) avatar_url          — 未來 Navigation 頭像 / 設定頁顯示
--   3) target_savings_rate — 分析頁跨月趨勢圖的「儲蓄目標」虛線基準
--
-- target_savings_rate 預設 20.0（per 商業常識，每月儲蓄率 20% 是健康基準），
-- CHECK 0-100 防 UI 端漏擋的爛資料。
--
-- profiles PK 是 user_id（不是 id，per memory），RLS policy 用 auth.uid()=user_id。
--
-- 全部 idempotent，可重複跑。
-- ──────────────────────────────────────────────────────────────

-- (1) 加欄位
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS target_savings_rate NUMERIC(5,2) NOT NULL DEFAULT 20.0;

-- (2) target_savings_rate 0-100 CHECK constraint
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_target_savings_rate_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_target_savings_rate_check
  CHECK (target_savings_rate >= 0 AND target_savings_rate <= 100);

-- (3) RLS policy — 確保「使用者可改自己 profile」這條存在
-- 既有 LINE 綁定功能能 work 代表多半已有 update policy，但 idempotent
-- DROP+CREATE 確保 SELECT/UPDATE 兩條都符合預期。
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_update ON profiles;

CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY profiles_update ON profiles
  FOR UPDATE USING (auth.uid() = user_id)
             WITH CHECK (auth.uid() = user_id);

-- 註：刻意不建 INSERT / DELETE policy
--   INSERT：profile row 由 handle_new_user trigger 在註冊瞬間建好，
--           應用層不該再 insert（也避免使用者亂塞）
--   DELETE：profile 跟 auth.users 1:1，刪 user 才該連動刪 profile，
--           那是 auth.users ON DELETE CASCADE 的工作


-- ──────────────────────────────────────────────────────────────
-- 驗證：
--   SELECT user_id, display_name, avatar_url, target_savings_rate
--   FROM profiles;
--   既有 row 應該看到 display_name / avatar_url 都是 NULL、
--   target_savings_rate = 20.00。
-- ──────────────────────────────────────────────────────────────
