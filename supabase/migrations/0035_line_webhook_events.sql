-- ==============================================================
-- Money Radar . 0035 . line_webhook_events - webhook 重送去重
--
-- 動機:
--   LINE 在收不到 200 時會重送同一個 webhook。而本專案的 handler 是把
--   整條 pipeline 都 await 完才回應:
--     下載媒體 -> Whisper / Vision -> Gemini -> 多次 DB round-trip
--     -> runBudgetAlerts -> LINE push
--   發票辨識這條特別容易超過 LINE 的等待時間 -> 重送 -> 同一張發票記兩次。
--   而且是靜默的：使用者只會看到帳目莫名多一筆。
--
--   LINE 每個事件都帶 webhookEventId（ULID，必填），拿它當天然的冪等鍵。
--
-- 為什麼是獨立一張表而不是在 transactions 上加欄位:
--   去重要涵蓋「還沒產生任何 transaction 就重送」的情況（例如第一次跑到
--   一半 timeout），也要涵蓋一個事件產生多筆交易的發票情境。事件層級的
--   claim 表是唯一能同時蓋住兩者的位置。
--
-- 保留期:
--   LINE 的重送窗口是分鐘級，這張表只需要短期資料。沒有自動清理 - 每筆
--   約 60 bytes，個人記帳規模下一年也才幾 MB。真的要清的話:
--     DELETE FROM line_webhook_events WHERE created_at < now() - interval '30 days';
--   （可之後掛到既有的 Vercel cron 上）
--
-- RLS:
--   只有 webhook 的 service role client 會讀寫，一般使用者完全碰不到。
--   仍然開 RLS 且不建任何 policy = 預設拒絕所有 anon / authenticated 存取，
--   service role 不受 RLS 限制照常運作。
--
-- 全部 idempotent，可重複跑。ASCII-only header 對齊 SQL Editor pre-parser。
-- ==============================================================

CREATE TABLE IF NOT EXISTS line_webhook_events (
  -- LINE 的 webhookEventId (ULID)。PK 本身就是去重機制:
  -- 重送時 INSERT 撞 23505，handler 直接跳過。
  event_id   TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS line_webhook_events_created_at_idx
  ON line_webhook_events (created_at);

ALTER TABLE line_webhook_events ENABLE ROW LEVEL SECURITY;


-- ==============================================================
-- 驗證:
--   INSERT INTO line_webhook_events (event_id) VALUES ('test-ulid-0001');
--   INSERT INTO line_webhook_events (event_id) VALUES ('test-ulid-0001');
--   -- 第二次應該噴 23505 duplicate key
--   DELETE FROM line_webhook_events WHERE event_id = 'test-ulid-0001';
-- ==============================================================
