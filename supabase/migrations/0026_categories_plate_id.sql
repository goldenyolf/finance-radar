-- ==============================================================
-- Money Radar . 0026 . categories.plate_id — 真.動態板塊路由
--
-- 動機（UAT 第三輪 spec）:
--   原本 LINE bot 路由鏈靠 `categories.default_account_id`（指向特定 account
--   id），是「靜態快照」— user 後續改板塊綁定，category 路由不會跟著變。
--   real SaaS 體驗應該：「家庭分類自動進家庭板塊綁的帳戶」，板塊內帳戶
--   變了 → 路由跟著變。
--
-- 解法:
--   新增 `categories.plate_id` 欄位 → 指向 dashboard_plates.id。
--   webhook 路由鏈優先讀 plate_id（取 plate.linked_account_ids[0]），
--   plate_id 為 null 才退到 default_account_id。
--
-- 設計:
--   a) plate_id UUID（dashboard_plates.id 是 UUID per 0007）+ FK ON DELETE
--      SET NULL — 板塊被刪不要把 category 一起拖走，就置 null 退到舊 fallback
--   b) 自動 backfill：對每個 (user, category)，找出當前 default_account_id
--      被綁進哪個 plate.linked_account_ids，若有就把 plate_id 寫進去
--   c) 多租戶安全：backfill 用 JOIN 對齊 user_id 不會跨租戶污染
--   d) idempotent — IF NOT EXISTS、conditional UPDATE
--   e) ASCII-only header (per memory)
-- ==============================================================


-- --------------------------------------------------------------
-- (1) 加欄位 + FK
-- --------------------------------------------------------------

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS plate_id UUID
    REFERENCES dashboard_plates(id) ON DELETE SET NULL;


-- --------------------------------------------------------------
-- (2) Backfill — 對每個 category，找出當前 default_account_id 落在哪個
--     plate 的 linked_account_ids 裡，就把 plate_id 寫進去。
--
--     JOIN 邏輯:
--       category.user_id = plate.user_id (多租戶 scope)
--       category.default_account_id = ANY(plate.linked_account_ids)
--
--     若 default_account_id 同時出現在多個 plate（user 自己 mis-bind），
--     取 sort_order 最小（首頁最左）的 plate；DISTINCT ON 保證每 category
--     只更新一次。
-- --------------------------------------------------------------

UPDATE categories c
   SET plate_id = sub.plate_id
  FROM (
    SELECT DISTINCT ON (cat.id)
           cat.id AS category_id,
           p.id AS plate_id
      FROM categories cat
      JOIN dashboard_plates p
        ON p.user_id = cat.user_id
       AND cat.default_account_id = ANY(p.linked_account_ids)
     WHERE cat.default_account_id IS NOT NULL
       AND cat.plate_id IS NULL
     ORDER BY cat.id, p.sort_order ASC, p.created_at ASC
  ) sub
 WHERE c.id = sub.category_id;


-- ==============================================================
-- 驗證:
--
-- (A) 欄位生效
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'categories' AND column_name = 'plate_id';
--   -- 預期 data_type=uuid, is_nullable=YES
--
-- (B) Backfill 結果（per user 看一下分類綁定哪個板塊）
--   SELECT c.user_id, c.code AS cat_code, c.name AS cat_name,
--          p.name AS plate_name, p.sort_order
--     FROM categories c
--     LEFT JOIN dashboard_plates p ON p.id = c.plate_id
--    WHERE c.type = 'expense'
--    ORDER BY c.user_id, p.sort_order NULLS LAST, c.code;
--
-- (C) 健診：family/childcare 等類別應該對到「家庭」plate
--     food_dining/transport 應該對到「個人」plate
-- ==============================================================
