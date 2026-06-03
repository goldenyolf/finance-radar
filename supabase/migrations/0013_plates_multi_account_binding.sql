-- ==============================================================
-- Money Radar . 0013 . dashboard_plates 升級成多帳戶綁定
--
-- 動機：
--   原本 plates 透過 linked_account_id 跟 accounts 走 1:1，BoardCard
--   只能呈現「一個板塊一個帳戶」。隨 Phase Cash 落地，使用者一個板塊
--   可能同時要看「現金錢包 + 共同銀行帳戶 + 共同信用卡」三條現金流，
--   1:1 model 撐不住「資產整合看板」的願景。
--
--   改為 N:1：plate 帶 linked_account_ids TEXT[]，元素是 accounts.id。
--   既有 RLS policy 以 user_id 比對、不以欄位為單位，array 欄位自動繼承。
--
-- 設計重點：
--   a) 新欄 linked_account_ids TEXT[] NOT NULL DEFAULT '{}'。空陣列 =
--      未綁定（取代舊版 linked_account_id IS NULL）。
--   b) Backfill 把既有 linked_account_id 包成單元素 array 灌進新欄；
--      NULL 的就維持 '{}'。
--   c) accounts.id 是 TEXT (per memory accounts_id_is_text)，array 元素
--      也是 TEXT — 對齊既有資料型別。
--   d) DROP COLUMN linked_account_id：完成 backfill 後砍乾淨。dev 環境
--      僅 2 user，不需要 dual-write 過渡。
--   e) 不加 FK constraint（PG array element 沒 native FK）。buildBoardData
--      對於「id 找不到對應 account」本來就 graceful skip。
--   f) **刻意不用 DO block + dollar-quote**（per memory 0004 教訓 /
--      Supabase SQL Editor 把整段包 transaction）。改用線性 ALTER + UPDATE
--      + ALTER 三步。代價：重跑時第 (2) 步會噴 42703 column does not exist
--      （因為舊欄已被 DROP）— 那是預期行為，schema 已在目標狀態，可忽略。
--      ASCII-only header (per Supabase SQL Editor pre-parser quirks)。
--
-- 跑完驗證：見檔尾。
-- ==============================================================


-- --------------------------------------------------------------
-- (1) 加新欄：linked_account_ids TEXT[]
-- --------------------------------------------------------------

ALTER TABLE dashboard_plates
  ADD COLUMN IF NOT EXISTS linked_account_ids TEXT[] NOT NULL DEFAULT '{}';


-- --------------------------------------------------------------
-- (2) Backfill：把舊欄 linked_account_id 包成單元素 array
--     只動「新欄還是空 + 舊欄非 NULL」的 row。
--     ► 第二次跑這支 migration 會在這行噴 42703 — 因為下一段已 DROP
--       舊欄。那是預期，schema 已在目標狀態，可忽略 / 跳過這條。
-- --------------------------------------------------------------

UPDATE dashboard_plates
   SET linked_account_ids = ARRAY[linked_account_id]
 WHERE linked_account_ids = '{}'
   AND linked_account_id IS NOT NULL;


-- --------------------------------------------------------------
-- (3) DROP 舊欄 linked_account_id
-- --------------------------------------------------------------

ALTER TABLE dashboard_plates
  DROP COLUMN IF EXISTS linked_account_id;


-- ==============================================================
-- 驗證指令：
--
-- (A) 欄位變更
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'dashboard_plates'
--      AND column_name IN ('linked_account_id', 'linked_account_ids');
--   -- 應該只看到 linked_account_ids；舊欄消失。
--
-- (B) Backfill 結果
--   SELECT id, name, linked_account_ids,
--          cardinality(linked_account_ids) AS n
--     FROM dashboard_plates
--    ORDER BY user_id, sort_order;
--   -- 原本有綁的 plate 應該 n=1，原本沒綁的 n=0。
-- ==============================================================
