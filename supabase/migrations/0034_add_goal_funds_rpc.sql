-- ==============================================================
-- Money Radar . 0034 . add_goal_funds() RPC - 夢想提撥原子化
--
-- 動機:
--   提撥金額目前是 read-modify-write 兩步式（actions/goals.ts 與 LINE
--   webhook 的 tryGoalDeposit 各一份）:
--     1) SELECT current_amount
--     2) UPDATE SET current_amount = <讀到的值> + amount
--   兩條併發就會互相覆蓋，少記一筆。
--
--   actions/goals.ts 的註解寫「單一使用者場景沒有 race condition」，但
--   LINE webhook 的 POST handler 是
--     await Promise.all((body.events ?? []).map(handleEvent))
--   —— 同一個 webhook payload 帶兩則「提撥 500」時，兩條 handler 併發跑，
--   race 是真的會發生的，不是理論值。
--
-- 作法:
--   把「讀 + 加」壓進單一 UPDATE ... SET x = x + n，交給 PG 的 row lock。
--   回傳更新前後的值，讓呼叫端仍算得出 justCompleted（跨過 100% 那一次）。
--
-- 安全性 - 為什麼是 SECURITY INVOKER (預設) 而不是 DEFINER:
--   本函式收 p_user_id 參數，因為 LINE webhook 走 service role client，
--   沒有 JWT、auth.uid() 是 NULL，無法從 session 推出使用者。
--   如果用 SECURITY DEFINER，任何登入者都能帶別人的 user_id 呼叫 =
--   權限提升。改用 INVOKER 並在函式內擋:
--     auth.uid() 非 NULL（一般登入者）-> 必須等於 p_user_id
--     auth.uid() 為 NULL（service role）-> 放行，只有後端持有該 key
--
-- 相容性:
--   純新增函式，不動 schema / 資料。呼叫端有 fallback：RPC 不存在時
--   自動退回原本的兩步式寫法（維持舊行為，只是 race 還在），所以這支
--   migration 沒跑也不會壞掉任何功能。
--   CREATE OR REPLACE 可重跑。ASCII-only header 對齊 SQL Editor pre-parser。
-- ==============================================================

CREATE OR REPLACE FUNCTION add_goal_funds(
  p_goal_id UUID,
  p_user_id UUID,
  p_amount  NUMERIC
)
RETURNS TABLE (
  previous_amount NUMERIC,
  new_amount      NUMERIC,
  target_amount   NUMERIC
)
LANGUAGE plpgsql
SET search_path = public
AS $body$
DECLARE
  v_prev NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'add_goal_funds: amount must be greater than 0';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'add_goal_funds: user mismatch';
  END IF;

  -- 鎖住該列再加值。找不到 / 不屬於這個 user -> 回 0 rows，呼叫端當作
  -- 「找不到該目標」處理。
  SELECT g.current_amount INTO v_prev
    FROM goals g
   WHERE g.id = p_goal_id AND g.user_id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE goals g
     SET current_amount = g.current_amount + p_amount
   WHERE g.id = p_goal_id AND g.user_id = p_user_id
  RETURNING v_prev, g.current_amount, g.target_amount;
END
$body$;


-- ==============================================================
-- 驗證 (SQL Editor 內 auth.uid() 是 NULL，會走 service role 分支):
--   SELECT * FROM add_goal_funds(
--     '<某個 goal id>'::uuid,
--     '<該 goal 的 user_id>'::uuid,
--     100
--   );
--   應回一列 previous_amount / new_amount / target_amount，
--   且 new_amount = previous_amount + 100。
--
--   帶不匹配的 user_id 應回 0 rows（不是報錯 - 因為是查不到列）:
--   SELECT * FROM add_goal_funds('<goal id>'::uuid, gen_random_uuid(), 100);
-- ==============================================================
