-- ──────────────────────────────────────────────────────────────
-- Money Radar · 0005 · transactions.category 改成 NULLABLE
--
-- 動機：income 交易在語意上沒有「花費分類」概念（薪水歸什麼 expense
-- category？沒意義）。Phase 雙向現金流上線時 server action 跟 LINE
-- webhook 都會把 income.category 寫成 null，但 DB 端有 NOT NULL
-- constraint 卡住，runtime 報錯：
--   null value in column "category" of relation "transactions"
--   violates not-null constraint
--
-- 處理：DROP NOT NULL。CHECK constraint（限制 enum 值）保留 — 只是
-- 允許「沒值」這個合法狀態。expense row 還是會被應用層強制給 'other'，
-- 行為跟修前一致。
-- ──────────────────────────────────────────────────────────────

ALTER TABLE transactions
  ALTER COLUMN category DROP NOT NULL;

-- 驗證：跑完應該回 'YES'
-- SELECT is_nullable FROM information_schema.columns
-- WHERE table_name = 'transactions' AND column_name = 'category';
