-- ==============================================================
-- Money Radar . 0021 . 補 user 缺漏的 dashboard_plates 3 列
--
-- 動機:
--   0020 section 6 用 UPDATE WHERE p.name='家庭財務' 把既有 3 plates 改成
--   新架構。但 user a5da7e24 完全沒有 plates（疑似早於 0007 trigger 註冊、
--   或手動刪光），UPDATE 0 row 命中 -> 首頁 boardData 變空 -> 引導去 settings
--   建第一個。
--
--   修補：對「pool 都備齊但缺 sort_order N」的 user 補 INSERT 對應 plate。
--   不是「user 完全沒 plate 才補全 3 個」— 用 per-sort_order guard 才能對
--   「只缺一兩個 sort_order」的邊角情況也安全。
--
-- 設計:
--   a) 3 條 INSERT，各自 JOIN 必要的 pool 帳戶 + NOT EXISTS per sort_order
--   b) 重跑安全：a5da7e24 跑完 3 列補齊，再跑全部 skip；1c56ddf2 早已
--      在 0020 section 6 改好，3 條都 NOT EXISTS 命中 skip
--   c) JOIN accounts 確保 pool 帳戶存在 — 不存在的 user (理論上 0020
--      INSERT NOT EXISTS 已補齊) 自然 skip，不會塞 NULL id 進 array
--   d) 沿用 0020 trigger fn 的命名 / description，視覺一致
--   e) ASCII-only header (per memory: SQL Editor pre-parser quirks)
-- ==============================================================


-- --------------------------------------------------------------
-- (1) 家庭 plate (sort 0) - bind {family_pool, post_office}
-- --------------------------------------------------------------

INSERT INTO dashboard_plates (user_id, name, description, linked_account_ids, sort_order)
SELECT u.id,
       '家庭',
       '家庭日常開銷與兒童補助專款',
       ARRAY[a_family.id, a_post.id],
       0
  FROM auth.users u
  JOIN accounts a_family ON a_family.user_id = u.id AND a_family.code = 'family_pool'
  JOIN accounts a_post   ON a_post.user_id   = u.id AND a_post.code   = 'post_office'
 WHERE NOT EXISTS (
   SELECT 1 FROM dashboard_plates p
    WHERE p.user_id = u.id AND p.sort_order = 0
 );


-- --------------------------------------------------------------
-- (2) 個人 plate (sort 1) - bind {personal_pool}
-- --------------------------------------------------------------

INSERT INTO dashboard_plates (user_id, name, description, linked_account_ids, sort_order)
SELECT u.id,
       '個人',
       '個人薪資、日常消費與訂閱',
       ARRAY[a.id],
       1
  FROM auth.users u
  JOIN accounts a ON a.user_id = u.id AND a.code = 'personal_pool'
 WHERE NOT EXISTS (
   SELECT 1 FROM dashboard_plates p
    WHERE p.user_id = u.id AND p.sort_order = 1
 );


-- --------------------------------------------------------------
-- (3) 現金 plate (sort 2) - bind {cash_wallet}
-- --------------------------------------------------------------

INSERT INTO dashboard_plates (user_id, name, description, linked_account_ids, sort_order)
SELECT u.id,
       '現金',
       '口袋零用、夜市與早餐',
       ARRAY[a.id],
       2
  FROM auth.users u
  JOIN accounts a ON a.user_id = u.id AND a.code = 'cash_wallet'
 WHERE NOT EXISTS (
   SELECT 1 FROM dashboard_plates p
    WHERE p.user_id = u.id AND p.sort_order = 2
 );


-- ==============================================================
-- 驗證:
--
-- (A) 每位 user 都該有 3 plates，按 0/1/2 排列
--   SELECT user_id, sort_order, name, cardinality(linked_account_ids) AS n
--     FROM dashboard_plates
--    ORDER BY user_id, sort_order;
--   -- 預期每 user 3 列：sort 0=家庭(n=2) / 1=個人(n=1) / 2=現金(n=1)
--
-- (B) 健診：仍缺 plate 的 user（理論上 0 列）
--   SELECT u.id
--     FROM auth.users u
--    WHERE (SELECT count(*) FROM dashboard_plates WHERE user_id = u.id) < 3;
-- ==============================================================
