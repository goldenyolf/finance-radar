-- ──────────────────────────────────────────────────────────────
-- Money Radar · 0009 · profiles.has_completed_onboarding
--
-- 新增「新手引導完成」狀態欄位。首頁載入時若 false → 自動彈
-- OnboardingDialog 三步驟教學；點完成或跳過後 server action
-- 翻成 true，這輩子不再彈。
--
-- 既有用戶（你自己 + 早期測試用戶）已熟悉系統 → backfill 成 true
-- 不打擾。要重新測 wizard 直接：
--   UPDATE profiles SET has_completed_onboarding = false WHERE id = '<your-id>';
-- ──────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN NOT NULL DEFAULT false;

-- Backfill：所有當下已存在的 profile 視為已完成（不打擾老用戶）
UPDATE profiles
SET has_completed_onboarding = true
WHERE has_completed_onboarding = false;

-- 驗證：
--   SELECT id, has_completed_onboarding FROM profiles;
-- 應該看到既有的 profile 全部變 true；之後新會員 row 預設 false。
