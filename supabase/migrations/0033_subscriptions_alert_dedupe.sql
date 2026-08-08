-- ==============================================================
-- Money Radar . 0033 . subscriptions 續扣提醒去重欄位
--
-- 動機 (兩個已上線的 bug):
--   a) cron 用 `daysUntilBilling(...) === 3` 嚴格等號挑出要提醒的訂閱。
--      cron 只要有一天沒跑到（部署中 / function 失敗 / 排程飄移），那筆
--      訂閱從此再也不會等於 3，next_billing_date 永遠不會被推進，
--      日期停在過去、之後每天都不命中 —— 該訂閱靜默死亡。
--   b) 舊版在「還剩 3 天」時就把 next_billing_date 推進一個週期。於是
--      LINE 說「剩 3 天扣款」，網頁的 SubscriptionAlertWidget（<= 7 天
--      才顯示）卻因為日期已跳到下個月而完全不顯示這筆，兩邊對不上。
--
-- 修法需要一個「這個扣款日我提醒過了沒」的持久標記，否則把條件從
--   `=== 3` 放寬成 `<= 3` 會連推 4 天。
--
-- 欄位語意:
--   last_alerted_billing_date = 「已針對這個 next_billing_date 推播過」
--   - NULL          : 這輪還沒推過 -> 進入提醒窗就推
--   - 等於 next_billing_date : 這輪推過了 -> 不再推
--   推進 next_billing_date 之後兩者自然不相等，下一輪重新開放推播。
--   用 billing date 當去重 key（而非 alerted_at 時間戳）是因為週期本身
--   就是天然的去重維度，跟 budget_alerts 的 alert_period 同一套思路。
--
-- 相容性:
--   純新增 nullable 欄位，既有 row 一律 NULL = 「還沒推過」。第一次跑
--   新 cron 時，落在提醒窗內的訂閱會各推一次，之後就穩定成一輪一次。
--   IF NOT EXISTS 可重跑。ASCII-only header 對齊 SQL Editor pre-parser。
-- ==============================================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS last_alerted_billing_date DATE;

-- ==============================================================
-- 驗證:
--   SELECT id, name, next_billing_date, last_alerted_billing_date
--   FROM subscriptions;
--   既有 row 的 last_alerted_billing_date 應該全為 NULL。
-- ==============================================================
