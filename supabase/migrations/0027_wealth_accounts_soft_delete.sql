-- ==============================================================
-- Money Radar . 0027 . wealth_accounts 軟刪除 + 原因追銷
--
-- 動機 (per UAT spec):
--   Hard delete 摧毀追溯性 — user 之後想知道「2026/05/27 那筆 40 萬保險為什麼
--   被踢出資產表」就無從查證。改成 archive pattern：保留 row、加 status 標
--   記、寫入封存原因 + 時間戳。
--
-- 設計:
--   a) 三欄全 nullable / 帶 DEFAULT，既有 row 安全升級 — 不會跟 NOT NULL
--      撞、不會擾動現存 SELECT
--   b) status CHECK 只允許 'active'/'archived'（snake_case，per memory
--      DB enum 命名慣例）
--   c) 不加索引 — wealth_accounts 是 per-user 小表 (一般 <10 戶)，過濾全表
--      掃就夠，省一條 index 維護成本
--   d) 配合本 migration 上線的 code 變更:
--      - load-wealth.ts SELECT 加 .eq('status', 'active')
--      - upsertWealthSnapshot / updateWealthAccount / archiveWealthAccount
--        內 SELECT 也加同樣過濾
--      - archiveWealthAccount 取代 deleteWealthAccount，純 UPDATE
--      → 大盤 / 圓餅 / 趨勢圖只看 active，archived 從現役視角消失
--      → 但 wealth_snapshots.details 完整歷史不擦，趨勢圖過去段呈現原樣
--   e) ASCII-only header (per memory: SQL Editor pre-parser quirks)
-- ==============================================================


-- --------------------------------------------------------------
-- (1) 三個新欄位
-- --------------------------------------------------------------

ALTER TABLE wealth_accounts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE wealth_accounts
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE wealth_accounts
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;


-- --------------------------------------------------------------
-- (2) status CHECK constraint
--     idempotent: DROP IF EXISTS 領頭，可重跑
-- --------------------------------------------------------------

ALTER TABLE wealth_accounts
  DROP CONSTRAINT IF EXISTS wealth_accounts_status_check;

ALTER TABLE wealth_accounts
  ADD CONSTRAINT wealth_accounts_status_check
  CHECK (status IN ('active', 'archived'));


-- ==============================================================
-- 驗證:
--
-- (A) 三欄位生效 + status DEFAULT 對既有 row 都填上
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'wealth_accounts'
--      AND column_name IN ('status', 'archive_reason', 'archived_at');
--
-- (B) 既有 row status 全部 'active'
--   SELECT user_id, count(*) FILTER (WHERE status = 'active') AS active,
--          count(*) FILTER (WHERE status = 'archived') AS archived
--     FROM wealth_accounts GROUP BY user_id;
--   -- 預期：每 user active = 你帳戶總數、archived = 0
--
-- (C) CHECK 防呆
--   UPDATE wealth_accounts SET status = 'whatever' WHERE id = '...'; -- 應該炸 23514
-- ==============================================================
