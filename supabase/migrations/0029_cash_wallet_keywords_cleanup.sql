-- ==============================================================
-- Money Radar . 0029 . 移除 cash_wallet 的情境詞 keywords
--
-- 動機（user 2026-07-03 bug 回報）:
--   LINE 打「支付：早餐 現金 30」→ 回覆「已成功記帳：[其他] 支付： $30
--   （隨身現金）」。「早餐」被吃掉、分類跌回 other。
--
--   root cause:
--     0020_pool_architecture 把 '夜市' + '早餐' 塞進 cash_wallet.keywords，
--     LLM 之前的 interceptAccountKeywords() 命中「早餐」→ 攔截器 spec 是
--     「命中即把該帳戶所有 keywords 從原文剪掉」→ '早餐' 跟 '現金' 一起
--     被挖光 → LLM 只看到「支付： 30」→ item 變成「支付：」、分類拿不到
--     '早餐' 這條 food_dining 提示 → 落 other。
--
--   概念錯誤:
--     account.keywords 的職責是「帳戶身份」（"台新"、"中信" 是識別碼），
--     '早餐' / '夜市' 是「消費情境」— 屬於 category keywords 的地盤
--     (expense-categories.ts EXPENSE_CATEGORY_KEYWORDS.food_dining 已含
--     '早餐' + '夜市'，本來就會走 keyword classifier 分到 food_dining)。
--     hardcode 到 account interceptor 反而讓 description 被過度剃除。
--
-- 設計:
--   a) 用 array_remove() 去掉這兩個字，其他 keywords（'現金' / '錢包' /
--      user 手動加的字）完全不動。idempotent — 已經沒有的 row 執行 array_remove
--      是 no-op。
--   b) 同步 CREATE OR REPLACE 0022 的 trigger fn，讓新註冊 user 拿到的
--      cash_wallet keywords 也是乾淨的 2 元素，避免這 bug 隨新會員重生。
--   c) '現金' + '錢包' 保留 — 那兩個是純帳戶身份的別名，就是「使用者不打
--      正式名稱 隨身現金 而是打 現金」時攔截器要能兜底的正解。
--   d) ASCII-only header (per memory: SQL Editor pre-parser quirks)
-- ==============================================================


-- --------------------------------------------------------------
-- (1) 清掉所有 cash_wallet 的 '夜市' + '早餐'（不動 user 其他自訂 keywords）
-- --------------------------------------------------------------

UPDATE accounts
   SET keywords = array_remove(array_remove(keywords, '夜市'), '早餐')
 WHERE code = 'cash_wallet';


-- --------------------------------------------------------------
-- (2) CREATE OR REPLACE trigger fn - 新會員 seed 拿乾淨版
--     其他 3 pool 保留 0022 那次的 keywords 不動。
-- --------------------------------------------------------------

CREATE OR REPLACE FUNCTION on_auth_user_seed_cash_account()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $fn$
BEGIN
  INSERT INTO accounts (id, user_id, name, type, balance, code, keywords)
  SELECT gen_random_uuid()::text, NEW.id, v.name, v.type, 0, v.code, v.keywords
  FROM (VALUES
    ('家庭公庫', 'bank', 'family_pool',
       ARRAY['台新', '台新銀行', '家庭公庫', '公庫', '家庭', '水電', '育兒', '公務']),
    ('個人零用', 'bank', 'personal_pool',
       ARRAY['中信', '中國信託', '個人零用']),
    ('郵局專戶', 'bank', 'post_office',
       ARRAY['郵局', '中華郵政', '補助', '幼兒補助']),
    ('隨身現金', 'cash', 'cash_wallet',
       ARRAY['現金', '錢包'])
  ) AS v(name, type, code, keywords)
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.user_id = NEW.id AND a.code = v.code
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed pool accounts failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION on_auth_user_seed_cash_account() OWNER TO postgres;


-- ==============================================================
-- 驗證:
--   SELECT code, keywords FROM accounts
--    WHERE code = 'cash_wallet' ORDER BY user_id;
--   -- 每 user cash_wallet keywords 應該 = ['現金', '錢包']（不含 '夜市' '早餐'）
--
-- 事後測試（LINE 打）:
--   支付：早餐 現金 30
--     → interceptAccountKeywords 命中 '現金' → 只剪 '現金'（'早餐' 保留）
--     → LLM 看到「支付：早餐 30」→ item="支付：早餐" or "早餐"、amount=30
--     → classifyByKeyword 命中 '早餐' → food_dining
--     → 回覆：[餐飲食品] 支付：早餐 $30（隨身現金）
-- ==============================================================
