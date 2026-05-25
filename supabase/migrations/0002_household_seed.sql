-- ──────────────────────────────────────────────────────────────
-- Money Radar · 0002 · 真實家庭帳戶與每月轉帳 seed
--
-- 包含：
--   • 4 個帳戶：台新共同 / 中信(我) / 合庫(老婆) / 郵局(幼兒補助)
--   • 2 對「薪水→共同」每月轉帳（用 expense + income 兩筆 recurring 配對表達，
--     在跨帳戶總視角會自然抵消，但在單一帳戶視角下能正確顯示流入/流出）
--
-- 重複執行安全 (idempotent)：所有 INSERT 都用 WHERE NOT EXISTS 或 IF NULL。
-- 帳戶餘額預設 0，請至 Supabase Studio 依實際餘額調整。
-- 房貸 / 保母 / 學費 / 小朋友 / 幼兒補助等項目金額另外再加。
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_user_id      uuid;
  v_acc_taishin  uuid;
  v_acc_ctbc     uuid;
  v_acc_tcb      uuid;
  v_acc_post     uuid;
  v_next_due     date := (date_trunc('month', current_date) + interval '1 month')::date;
BEGIN
  -- 1) 確保有一個 user (如果還沒有就建立一筆)
  SELECT id INTO v_user_id FROM users LIMIT 1;
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO users (id, name, emergency_fund_threshold)
    VALUES (v_user_id, '我', 50000);
  END IF;

  -- 2) 4 個帳戶
  SELECT id INTO v_acc_taishin
    FROM accounts WHERE user_id = v_user_id AND name = '台新銀行 共同帳戶' LIMIT 1;
  IF v_acc_taishin IS NULL THEN
    v_acc_taishin := gen_random_uuid();
    INSERT INTO accounts (id, user_id, name, type, balance)
    VALUES (v_acc_taishin, v_user_id, '台新銀行 共同帳戶', 'bank', 0);
  END IF;

  SELECT id INTO v_acc_ctbc
    FROM accounts WHERE user_id = v_user_id AND name = '中國信託 我的帳戶' LIMIT 1;
  IF v_acc_ctbc IS NULL THEN
    v_acc_ctbc := gen_random_uuid();
    INSERT INTO accounts (id, user_id, name, type, balance)
    VALUES (v_acc_ctbc, v_user_id, '中國信託 我的帳戶', 'bank', 0);
  END IF;

  SELECT id INTO v_acc_tcb
    FROM accounts WHERE user_id = v_user_id AND name = '合作金庫 老婆帳戶' LIMIT 1;
  IF v_acc_tcb IS NULL THEN
    v_acc_tcb := gen_random_uuid();
    INSERT INTO accounts (id, user_id, name, type, balance)
    VALUES (v_acc_tcb, v_user_id, '合作金庫 老婆帳戶', 'bank', 0);
  END IF;

  SELECT id INTO v_acc_post
    FROM accounts WHERE user_id = v_user_id AND name = '郵局 幼兒補助' LIMIT 1;
  IF v_acc_post IS NULL THEN
    v_acc_post := gen_random_uuid();
    INSERT INTO accounts (id, user_id, name, type, balance)
    VALUES (v_acc_post, v_user_id, '郵局 幼兒補助', 'bank', 0);
  END IF;

  -- 3) 每月「薪水→共同」轉帳，拆成 expense + income 兩筆 recurring。
  --    跨帳戶加總會自然抵消，但個別帳戶視角能正確顯示流入/流出。

  -- 中信 → 台新 (我 75,000)
  IF NOT EXISTS (
    SELECT 1 FROM recurring_payments
    WHERE user_id = v_user_id AND title = '每月轉至共同帳戶（我）'
  ) THEN
    INSERT INTO recurring_payments
      (id, user_id, account_id, title, amount, type, frequency, next_due_date)
    VALUES
      (gen_random_uuid(), v_user_id, v_acc_ctbc,
       '每月轉至共同帳戶（我）', 75000, 'expense', 'monthly', v_next_due);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM recurring_payments
    WHERE user_id = v_user_id AND title = '每月來自我的轉入'
  ) THEN
    INSERT INTO recurring_payments
      (id, user_id, account_id, title, amount, type, frequency, next_due_date)
    VALUES
      (gen_random_uuid(), v_user_id, v_acc_taishin,
       '每月來自我的轉入', 75000, 'income', 'monthly', v_next_due);
  END IF;

  -- 合庫 → 台新 (老婆 15,000)
  IF NOT EXISTS (
    SELECT 1 FROM recurring_payments
    WHERE user_id = v_user_id AND title = '每月轉至共同帳戶（老婆）'
  ) THEN
    INSERT INTO recurring_payments
      (id, user_id, account_id, title, amount, type, frequency, next_due_date)
    VALUES
      (gen_random_uuid(), v_user_id, v_acc_tcb,
       '每月轉至共同帳戶（老婆）', 15000, 'expense', 'monthly', v_next_due);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM recurring_payments
    WHERE user_id = v_user_id AND title = '每月來自老婆的轉入'
  ) THEN
    INSERT INTO recurring_payments
      (id, user_id, account_id, title, amount, type, frequency, next_due_date)
    VALUES
      (gen_random_uuid(), v_user_id, v_acc_taishin,
       '每月來自老婆的轉入', 15000, 'income', 'monthly', v_next_due);
  END IF;
END $$;
