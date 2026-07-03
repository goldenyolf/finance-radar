-- ==============================================================
-- Money Radar . 0031 . 清掉 transactions.category 所有殘存 CHECK constraint
--
-- 動機（user 2026-07-03 回報）:
--   儲存自訂分類「家庭醫療」時噴：
--     new row for relation "transactions" violates check constraint
--     "transactions_category_check1"
--
--   0030 只 DROP 了 `transactions_category_check` / `_check_new` 這兩個名字，
--   但 PG 遇到歷史反覆 DROP+ADD 同名 constraint 時會自動 suffix `_check1`
--   `_check2` ...。這個殘存的 CHECK 還在擋 UUID 寫入 → 自訂分類失敗。
--
-- 設計:
--   a) 動態掃 pg_constraint，砍所有 conrelid=transactions 且 def 提到
--      'category' 但不含 'income_category' 的 CHECK — 一次清乾淨、
--      未來若又長出 auto-suffix 的 constraint 重跑也是 no-op。
--   b) 用 $body$ dollar-tag（不用 $$）避開 SQL Editor pre-parser 對 DDL
--      混 $$ 的地雷（per memory: supabase_sql_editor_transaction）。
--   c) 用 position() 取代 ILIKE '%..%'（per memory: supabase_sql_editor_unicode_comments）。
--   d) EXECUTE 拼字串用 quote_ident() 防 conname 被引號打包錯（極端 case）。
--   e) idempotent：重跑無害。
--
-- 影響:
--   跑完 transactions.category 完全開放（TEXT，任意字串），跟 0030 想達到
--   的最終狀態一致。resolveCategory 前端 byId → byCode 已能 handle。
-- ==============================================================


DO $body$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = 'transactions'::regclass
       AND contype = 'c'
  LOOP
    IF position('category' in con.def) > 0
       AND position('income_category' in con.def) = 0
    THEN
      EXECUTE 'ALTER TABLE transactions DROP CONSTRAINT ' ||
              quote_ident(con.conname);
    END IF;
  END LOOP;
END
$body$;


-- ==============================================================
-- 驗證:
--
-- (A) 應該完全找不到跟 category 相關的 CHECK 了（除了 income_category）
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'transactions'::regclass
--      AND contype = 'c'
--    ORDER BY conname;
--   -- 只該看到 income_category_check / type_check / priority_check /
--   --   status_check / payment_method_check 這類跟 category 無關的
--
-- (B) 試寫自訂 UUID 應該成功（把 <uuid> 換成你的 categories.id）
--   UPDATE transactions
--      SET category = '<some-user-category-uuid>'
--    WHERE id = '<some-tx-uuid>' AND user_id = '<your-user-uuid>';
-- ==============================================================
