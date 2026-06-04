-- ==============================================================
-- Money Radar . 0018 . dashboard_plates 加 emoji 自訂欄位
--
-- 動機：
--   現行板塊 emoji 由 derivePlateEmoji(name) 從名稱 regex 推導：
--     家庭/共同 → 🏠、補助/被動 → 👶、個人/本人 → 👨‍💼…
--   名稱沒命中規則的 plate 一律走 🏷️ 通用 fallback，使用者無法選自訂。
--   Phase 2 要支援「編輯模式 + 點 emoji → Popover 20 選 1」的爽感互動，
--   需要 DB 端有自訂 emoji 欄位儲存使用者決策。
--
-- 設計：
--   a) 新欄位 emoji TEXT NULL — 不加 CHECK 約束（emoji unicode 範圍太廣，
--      硬列白名單反而綁手綁腳；應用層 Popover 限制選項即可）。
--   b) 既有 row 不 backfill 也 OK — UI 端 plate.emoji ?? derivePlateEmoji(name)
--      自動降級，使用者沒主動改過的板塊還是顯示原本算的 emoji。
--   c) 不影響 0007 的 seed trigger（新會員預設板塊沒帶 emoji，照舊由
--      derivePlateEmoji 算）；trigger 不用 update。
--   d) idempotent + IF NOT EXISTS — 可重跑安全。
-- ==============================================================


-- --------------------------------------------------------------
-- (1) 加新欄位
-- --------------------------------------------------------------

ALTER TABLE dashboard_plates
  ADD COLUMN IF NOT EXISTS emoji TEXT;


-- ==============================================================
-- 驗證指令：
--
-- (A) 欄位存在 + NULL OK
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'dashboard_plates'
--      AND column_name = 'emoji';
--   -- 應該回 data_type=text, is_nullable=YES
--
-- (B) 既有 row 確實 emoji=NULL（沒做 backfill）
--   SELECT id, name, emoji FROM dashboard_plates ORDER BY user_id, sort_order;
--   -- 每筆 emoji 都應該是 NULL；UI 自動 fallback 走 derivePlateEmoji(name)
--
-- (C) 試插自訂值
--   UPDATE dashboard_plates SET emoji = '💎' WHERE id = '<some plate id>';
--   -- 接著重整網頁應該看到那張板塊顯示 💎
-- ==============================================================
