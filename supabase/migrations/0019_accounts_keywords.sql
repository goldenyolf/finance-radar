-- ==============================================================
-- Money Radar . 0019 . accounts.keywords -- LINE bot 硬規則攔截鑰匙圈
--
-- 動機：
--   LINE LLM 解析在「晚餐（測試） 台新信用卡 100」這類字詞順序混雜時，會
--   把「台新信用卡」誤判成描述，連帶讓 fallback chain 跌到 type='cash' 兜底
--   錯帳戶（per spec：「信用卡錯塞現金錢包」）。
--
-- 對策（per spec 方案一）：
--   在 LLM 之前先過一層 in-memory 硬規則攔截器；命中即鎖 account_id，並把
--   命中關鍵字從原文挖掉再丟給 LLM。攔截器靠的就是這張表新增的 keywords
--   欄位 — 每個 user 自己定義「這個帳戶會被叫成什麼」。
--
-- 設計：
--   a) 型別走 TEXT[] 而非 categories.keywords 的逗號分隔 TEXT。理由：
--        - 攔截器要逐項做 regex / indexOf，array 直接 unnest 不用 split
--        - PG 端 GIN/array operator 將來要做「user 是否有任何 keywords」
--          的健診 query 也方便（cardinality() > 0）
--        - 跟 categories.keywords 風格不一致是有意的；那邊的 TEXT 是早期
--          沿用，這邊用 native array 把後端用法收乾淨
--      雙軌共存不衝突 — 應用層各自有 parser。
--   b) NOT NULL DEFAULT '{}'。null 與空陣列在攔截器邏輯上等價，但 NOT NULL
--      免掉 TS 端 `keywords ?? []` 的散落判空，讓 type 直接 string[]。
--   c) 既有 row backfill 「常見台灣銀行名」最小集合 — 只 update keywords='{}'
--      的 row（不覆蓋使用者後續手動編輯），用 position() 取代 ILIKE '%x%'
--      避開 Supabase SQL Editor 的 % literal parse 地雷 (per memory)。
--      backfill 列表覆蓋專案 0002 seed 的四個帳戶 + 「現金錢包」trigger seed。
--      其他客製名稱由 user 後續手動填（未來 UI 出來時走 settings card）。
--   d) idempotent：IF NOT EXISTS / 條件 backfill 都重跑安全。
--   e) 不動 trigger — 新會員的「現金錢包」由 0012 的 on_auth_user_seed_cash_account
--      建立，那邊不寫 keywords 也 OK（DEFAULT '{}' 接住）；現金 fast-path
--      在 matchAccount 已用 type='cash' 解掉，不必硬塞 keywords。
-- ==============================================================


-- --------------------------------------------------------------
-- (1) 加欄位 — NOT NULL DEFAULT '{}' 安全 backfill 所有既有 row
-- --------------------------------------------------------------

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS keywords TEXT[] NOT NULL DEFAULT '{}';


-- --------------------------------------------------------------
-- (2) 已知銀行名 backfill
--     只更新 keywords 仍是空 array 的 row，使用者後續手動編輯不會被覆蓋。
--     使用 position('xxx' in name) > 0 取代 ILIKE '%xxx%'，避開 SQL Editor
--     pre-parser 對 % literal 的 quirks (per memory)。
-- --------------------------------------------------------------

UPDATE accounts SET keywords = ARRAY['台新', '台新銀行']
 WHERE cardinality(keywords) = 0
   AND position('台新' in name) > 0;

UPDATE accounts SET keywords = ARRAY['中信', '中國信託']
 WHERE cardinality(keywords) = 0
   AND (position('中信' in name) > 0 OR position('中國信託' in name) > 0);

UPDATE accounts SET keywords = ARRAY['合庫', '合作金庫']
 WHERE cardinality(keywords) = 0
   AND (position('合庫' in name) > 0 OR position('合作金庫' in name) > 0);

UPDATE accounts SET keywords = ARRAY['郵局', '中華郵政']
 WHERE cardinality(keywords) = 0
   AND (position('郵局' in name) > 0 OR position('中華郵政' in name) > 0);

UPDATE accounts SET keywords = ARRAY['玉山']
 WHERE cardinality(keywords) = 0 AND position('玉山' in name) > 0;

UPDATE accounts SET keywords = ARRAY['國泰', '國泰世華']
 WHERE cardinality(keywords) = 0
   AND (position('國泰' in name) > 0 OR position('國泰世華' in name) > 0);

UPDATE accounts SET keywords = ARRAY['兆豐']
 WHERE cardinality(keywords) = 0 AND position('兆豐' in name) > 0;

UPDATE accounts SET keywords = ARRAY['華南']
 WHERE cardinality(keywords) = 0 AND position('華南' in name) > 0;

UPDATE accounts SET keywords = ARRAY['第一', '第一銀行']
 WHERE cardinality(keywords) = 0 AND position('第一銀行' in name) > 0;

UPDATE accounts SET keywords = ARRAY['永豐']
 WHERE cardinality(keywords) = 0 AND position('永豐' in name) > 0;

UPDATE accounts SET keywords = ARRAY['聯邦']
 WHERE cardinality(keywords) = 0 AND position('聯邦' in name) > 0;

UPDATE accounts SET keywords = ARRAY['富邦', '台北富邦']
 WHERE cardinality(keywords) = 0
   AND (position('富邦' in name) > 0 OR position('台北富邦' in name) > 0);

UPDATE accounts SET keywords = ARRAY['元大']
 WHERE cardinality(keywords) = 0 AND position('元大' in name) > 0;

UPDATE accounts SET keywords = ARRAY['新光']
 WHERE cardinality(keywords) = 0 AND position('新光' in name) > 0;


-- ==============================================================
-- 驗證指令（跑完手動貼到 SQL Editor 對結果）：
--
-- (A) 欄位存在 + 型別 + NOT NULL DEFAULT
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'accounts'
--      AND column_name = 'keywords';
--   -- 應該回 data_type=ARRAY, is_nullable=NO, column_default='{}'::text[]
--
-- (B) backfill 結果（per user 看一下）
--   SELECT user_id, name, type, keywords
--     FROM accounts
--    ORDER BY user_id, name;
--
-- (C) 健診：哪些帳戶還沒 keywords（user 看到要手動補）
--   SELECT user_id, name, type
--     FROM accounts
--    WHERE cardinality(keywords) = 0
--    ORDER BY user_id, name;
--
-- (D) 試插自訂值（信用卡帳戶為例）
--   UPDATE accounts
--      SET keywords = ARRAY['台新信用卡', '台新刷卡', '台新']
--    WHERE id = '<some account id>'
--      AND user_id = '<owner uuid>';
--   -- 多租戶：UPDATE 一定要 scope by user_id (per memory)
-- ==============================================================
