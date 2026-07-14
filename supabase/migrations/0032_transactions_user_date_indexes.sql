-- ==============================================================
-- Money Radar . 0032 . transactions 熱路徑複合索引
--
-- 動機:
--   transactions 是全站最熱的表：首頁 / 分析 / 明細三頁每次 RSC 都
--   全量 select，且 RLS policy 為 `auth.uid() = user_id`（0028）。但先前
--   只有 transfer_group_id / account_id / recurring_period 三個索引
--   （0001 / 0015），user_id 與 date 完全沒索引 —— 每次查詢都對整張表
--   做 sequential scan，資料越多越慢。
--
-- 索引設計:
--   a) (user_id, date DESC) —— 一次覆蓋三個熱查詢：
--        * RLS / .eq("user_id", uid) 的等值過濾（前導欄）
--        * 明細頁 order by date desc limit 200（後導欄同序，免排序）
--        * 本月 / date range 區間掃描（範圍條件落在後導欄）
--   b) (user_id, category) —— 分析頁分類圓餅 / Sankey 依 category 聚合，
--        搭配 user_id 前導做多租戶內的分類彙總。
--
--   兩者皆 IF NOT EXISTS，可重跑安全。純新增索引、不動 schema / 資料，
--   對既有 query 只會變快不會變慢，零回滾風險。
--   ASCII-only header 對齊 SQL Editor pre-parser quirk。
--
-- 影響範圍:
--   - 無程式改動即生效；PG planner 自動改走 index scan。
--   - 寫入路徑（INSERT / UPDATE transactions）多維護兩個索引，個人記帳
--     規模下寫入量極低，成本可忽略。
-- ==============================================================

CREATE INDEX IF NOT EXISTS transactions_user_date_idx
  ON transactions (user_id, date DESC);

CREATE INDEX IF NOT EXISTS transactions_user_category_idx
  ON transactions (user_id, category);
