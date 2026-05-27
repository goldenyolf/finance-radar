-- ──────────────────────────────────────────────────────────────
-- Money Radar · 0006 · categories.is_fixed 欄位
--
-- 用途：「財務硬性負擔率」分析需要區分固定（房貸、保險、長照等綁死的錢）
-- 跟浮動（餐飲、交通、其他臨時花費）兩類支出。
--
-- 操作：
--   1) 加欄位 is_fixed BOOLEAN，預設 false
--   2) 對既有 7 個 seed code 做 backfill：
--      childcare_education / eldercare / finance_insurance / home_living → true
--      其餘（food_dining / transport / other / 使用者自訂 code=null）→ 維持 false
--   3) 加 BEFORE INSERT trigger — 之後新會員 sign up 由其他 trigger seed
--      預設 7 個分類時，這個 trigger 會自動把上述 4 個 code 設成 is_fixed=true。
--      這樣未來不用每次 onboarding seed function 改動都記得同步更新。
--
-- 全部 idempotent，可重複執行。
-- ──────────────────────────────────────────────────────────────

-- (1) 加欄位（IF NOT EXISTS，PG 9.6+）
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT false;

-- (2) Backfill：把 4 個固定向 code 既有資料翻成 true
UPDATE categories
SET is_fixed = true
WHERE code IN (
  'childcare_education', -- 育兒教育
  'eldercare',           -- 孝親長照
  'finance_insurance',   -- 金融保險
  'home_living'          -- 居家生活（含水電）
);

-- (3) Trigger 函式：INSERT 時自動依 code 設 is_fixed
CREATE OR REPLACE FUNCTION categories_default_is_fixed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $fn$
BEGIN
  -- 只在 caller 沒明確設 is_fixed（依舊是預設 false）時，才依 code 補正
  IF NEW.is_fixed = false AND NEW.code IN (
    'childcare_education',
    'eldercare',
    'finance_insurance',
    'home_living'
  ) THEN
    NEW.is_fixed := true;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS categories_default_is_fixed_trg ON categories;

CREATE TRIGGER categories_default_is_fixed_trg
  BEFORE INSERT ON categories
  FOR EACH ROW
  EXECUTE FUNCTION categories_default_is_fixed();


-- ──────────────────────────────────────────────────────────────
-- 驗證：跑完應該看到 4 列 is_fixed=true（你的 user 那 7 個 seed 分類）
--   SELECT code, name, is_fixed FROM categories
--   WHERE code IS NOT NULL ORDER BY code;
-- ──────────────────────────────────────────────────────────────
