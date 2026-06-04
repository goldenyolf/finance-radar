# 🧪 Money Radar UAT — 用戶驗收測試清單 v1.0

> 9 大核心模組 × 45+ 個用戶視角案例。每案附 DB 驗證 SQL 供測完即查。

| 項目 | 說明 |
|---|---|
| 文件版本 | UAT v1.0 (2026-06-04) |
| 適用版本 | main 分支 `e56be9b` 後 |
| 測試精神 | 「蹂躪它，找它哪裡會痛」— 對應 PRD 每個 spec 都至少有一個 happy path + 一個 edge case |
| 通過標準 | 所有「通過條件」勾選 ✅ + DB 查詢結果與預期一致 |

---

## 0. 測試環境準備

### 0.1 帳號與資料前置

```
✅ Supabase Production 已跑完所有 migration (0001-0018)
✅ 至少 2 個 user（測多租戶隔離用），其中一位綁定 LINE userId
✅ 已建立至少 4 個 accounts：bank × 2、credit_card × 1、cash × 1（cash 應由 0012 trigger 自動 seed）
✅ 已建立 3 個 dashboard_plates (家庭 / 補助 / 個人)
✅ 至少 3 個 categories 設了 budget_monthly（測預算警報用）
✅ 至少 2 筆 recurring_payments（測 placeholder 核銷用，next_due_date 可手動調到今天）
```

### 0.2 裝置矩陣

| 裝置 | 用途 | 重點驗收 |
|---|---|---|
| Desktop Chrome (1440p+) | 主開發環境 | sidebar 摺疊、Recharts 動畫、拖拉排序 |
| iPhone Safari (iOS 17+) | PWA + 防窺 + 移動 UX | 加入主畫面、狀態列融合、無震動但無崩潰 |
| Android Chrome (12+) | Haptic 真實測試 | 切 tab 微震、核銷震動、PWA install prompt |
| iPad Safari | 中間尺寸 | layout 是否破版 |

---

## 1. LINE Bot 雙層語意路由

### Test 1.1: 純後綴帳戶覆蓋

**場景**：使用者下班路上隨手記一筆，明示指定特定銀行帳戶扣款。

**前置**：已綁定 LINE userId；帳戶名稱包含「中信」字眼（例：「中信薪資戶」）。

**步驟**：
1. 從 LINE 對話框傳：`晚餐 500 中信`

**預期反饋**：
- LINE 在 < 5 秒內回覆 `✅ 已成功記帳：[餐飲食品] 晚餐 $500 🏦（中信薪資戶）`
- 訊息結尾 emoji 為 🏦（transfer，因為 bank 帳戶）
- 不是 💵 也不是 💳

**DB 驗證**：
```sql
SELECT description, amount, account_id, category, payment_method, type
  FROM transactions
 WHERE description = '晚餐'
   AND date = current_date
 ORDER BY created_at DESC LIMIT 1;
-- 預期：account_id = 中信帳戶 id / category=food_dining / payment_method=transfer
```

**通過條件**：
- [ ] LINE 5 秒內回覆
- [ ] 帳戶名稱顯示「中信薪資戶」（**不是**首個帳戶字典序的）
- [ ] payment_method 為 transfer
- [ ] DB account_id 對齊中信帳戶

---

### Test 1.2: 分類預設帳戶 fallback (Layer B)

**場景**：使用者沒明示帳戶，但該分類有預設帳戶（例：「水電」綁台新）。

**前置**：到 `/settings → 分類管理 → 水電費`，預設帳戶下拉選「台新共同戶」。

**步驟**：
1. LINE 傳：`電費 1850 網銀`

**預期反饋**：
- 回覆顯示扣到「台新共同戶」（**不是**第一個帳戶 / 不是現金錢包）
- payment_method 為 transfer

**DB 驗證**：
```sql
SELECT account_id, category, payment_method FROM transactions
 WHERE description = '電費' AND date = current_date
 ORDER BY created_at DESC LIMIT 1;
```

**通過條件**：
- [ ] account_id = 「台新共同戶」id
- [ ] category = home_living
- [ ] 不是兜底到字典序首個帳戶

---

### Test 1.3: 「幫家用」修飾語不該影響分類本質

**場景**：使用者輸入帶情境括弧的訊息。

**步驟**：
1. LINE 傳：`午餐摩斯（幫老婆買）台新刷卡 105`

**預期反饋**：
- 回覆 description **保留括弧**：`午餐摩斯（幫老婆買）` 
- category 仍是 food_dining（不是 other）
- 帳戶是台新（不是現金錢包）
- payment_method 為 credit_card

**DB 驗證**：
```sql
SELECT description, category, payment_method, account_id FROM transactions
 WHERE description LIKE '午餐摩斯%' ORDER BY created_at DESC LIMIT 1;
```

**通過條件**：
- [ ] description 含「（幫老婆買）」整段
- [ ] category = food_dining
- [ ] payment_method = credit_card
- [ ] account_id = 台新帳戶

---

### Test 1.4: Uber Eats vs Uber 衝突

**場景**：同句帶餐飲詞 + Uber 必須優先食物分類。

**步驟**：
1. LINE 傳：`午餐 麥當勞 uber 信用卡 299`

**預期反饋**：
- category = food_dining（**不是** transport）
- 回覆訊息開頭 `[餐飲食品]`

**DB 驗證**：
```sql
SELECT description, category FROM transactions
 WHERE description LIKE '%麥當勞%uber%' AND date = current_date
 ORDER BY created_at DESC LIMIT 1;
```

**通過條件**：
- [ ] category 為 food_dining
- [ ] payment_method = credit_card

---

### Test 1.5: Placeholder 核銷比對（LINE 路徑）

**場景**：每月 1 號 recurring 自動 materialize 為 placeholder，使用者月中實付不同金額。

**前置**：手動把某筆 recurring（例 title='大寶月費'）next_due_date UPDATE 成今天。

**步驟**：
1. 重整首頁讓 `materialize_due_recurrings` 跑（loadDashboard 內已內建）
2. 看到首頁出現 ⏳ amber chip
3. LINE 傳：`轉帳大寶月費 11200`

**預期反饋**：
- 不是 INSERT 新交易，而是「✅ 已核銷週期：[育兒教育] 大寶月費 $11,200 🏦（預估 $10,000 → 實付 $11,200）」
- 重整首頁 → ⏳ chip 消失
- 通知中心 Bell pulse 點消失

**DB 驗證**：
```sql
SELECT description, amount, fulfillment_state FROM transactions
 WHERE description = '大寶月費' AND date::text LIKE to_char(current_date, 'YYYY-MM') || '%';
-- 預期：只有 1 筆，amount=11200，fulfillment_state='confirmed'
```

**通過條件**：
- [ ] 同月份只有 1 筆（沒重複 INSERT）
- [ ] amount 從預估值更新為實付
- [ ] fulfillment_state 從 placeholder → confirmed
- [ ] payment_method = transfer

---

### Test 1.6: 收入多維度分類（per 0017）

**場景**：4 種收入類型應分流到對應 income_category。

**步驟**：分別傳：
1. `薪水 75000 中信`
2. `接案稿費 12000`
3. `中租配息 3200`
4. `領到幼兒補助 5000`

**預期反饋**：每條都該得到 `💰 已記錄收入：...`

**DB 驗證**：
```sql
SELECT description, income_category, type FROM transactions
 WHERE type = 'income' AND date = current_date
 ORDER BY created_at DESC LIMIT 4;
-- 預期 4 筆對應 salary / side_hustle / investment / other
```

**通過條件**：
- [ ] 4 筆 income_category 分別 = salary / side_hustle / investment / other
- [ ] 沒有任何一筆是 NULL

---

## 2. 1:N 板塊帳戶綁定

### Test 2.1: Settings 多選帳戶綁定

**場景**：「家庭財務」板塊綁台新共同戶 + 中信 + 現金錢包三個帳戶。

**步驟**：
1. 到 `/settings → 戰情室板塊配置`
2. 點「家庭財務」編輯
3. 在帳戶 chip list 內勾選 3 個帳戶（看到勾選 chip 走 `bg-foreground/[0.06] + ring-foreground/15` 視覺）
4. 儲存

**預期反饋**：
- Toast「已更新板塊」
- 設定頁該 plate 的 chip row 顯示 3 個帳戶 icon
- 重整首頁 → 家庭財務卡的「關聯帳戶」chip line 顯示 3 個名稱

**DB 驗證**：
```sql
SELECT name, linked_account_ids, cardinality(linked_account_ids) AS n
  FROM dashboard_plates WHERE name = '家庭財務';
-- 預期：n=3
```

**通過條件**：
- [ ] DB linked_account_ids 含 3 個 id
- [ ] 首頁顯示 3 個帳戶名

---

### Test 2.2: 多帳戶餘額總額計算

**場景**：家庭板塊「資產總額」應 = 3 個綁定帳戶 balance 加總。

**前置**：手動到 Supabase Studio 把 3 個帳戶 balance 改成 50000 / 30000 / -8000（信用卡負）。

**步驟**：重整首頁。

**預期反饋**：
- 「家庭財務」卡片頂部「資產總額」大字 = `NT$72,000`（50000+30000−8000）
- 下方子帳戶 list 3 行：
  - 🏦 台新共同戶 `$50,000`
  - 🏦 中信 `$30,000`
  - 💳 信用卡 `-$8,000` (rose 染色)

**通過條件**：
- [ ] 總額算術正確
- [ ] 信用卡負餘額顯示 rose
- [ ] 3 個帳戶各帶對應 type icon

---

### Test 2.3: 多帳戶 transactions 聚合

**場景**：家庭板塊「本月已支出」應包含所有 3 個帳戶的支出。

**步驟**：
1. 在台新帳戶下記一筆 expense 1000
2. 在中信帳戶下記一筆 expense 500
3. 重整首頁

**預期反饋**：
- 家庭板塊「本月已支出」+= 1500
- 「本月明細」list 包含這 2 筆

**通過條件**：
- [ ] 已支出加總正確
- [ ] 明細 list 兩筆都出現

---

## 3. 現金錢包實體化

### Test 3.1: 新會員 trigger seed

**場景**：新使用者註冊應自動拿到「現金錢包」帳戶。

**步驟**：到 `/auth/sign-up` 註冊一個全新 email。

**DB 驗證**：
```sql
-- 新會員 user_id 從 auth.users 撈
SELECT a.user_id, a.name, a.type, a.balance
  FROM accounts a
 WHERE a.user_id = '<new user uuid>'
   AND a.type = 'cash';
-- 預期：1 筆 name='現金錢包', balance=0
```

**通過條件**：
- [ ] 新會員自動有 type='cash' 的「現金錢包」帳戶
- [ ] 「個人財務」plate.linked_account_ids 自動含 cash 帳戶 id (per 0014)

---

### Test 3.2: LINE 盲打兜底到現金錢包

**場景**：使用者隨手傳「午餐 100」沒提帳戶 / 沒提付款方式，應自動兜底到現金錢包。

**步驟**：
1. LINE 傳：`午餐 100`

**預期反饋**：
- 回覆訊息 `（現金錢包）` 在帳戶位置
- 結尾 emoji 是 💵（cash）

**DB 驗證**：
```sql
SELECT account_id, payment_method FROM transactions
 WHERE description = '午餐' AND amount = 100 AND date = current_date
 ORDER BY created_at DESC LIMIT 1;
```

**通過條件**：
- [ ] account_id = 現金錢包 id
- [ ] payment_method = cash

---

### Test 3.3: Quick Add 雙向綁定（支出/付款方式）

**場景**：在 Quick Add 表單切換 paymentMethod 應自動切到對應 type 帳戶。

**步驟**：
1. 桌面右上點「快速記帳」
2. 點「💳 刷卡」pill
3. 觀察「扣款帳戶」下拉的選中值

**預期反饋**：
- 帳戶下拉自動切到 type='credit_card' 第一個帳戶
- 反向：在帳戶下拉選現金錢包 → pill 自動跳回「💵 現金」

**通過條件**：
- [ ] 雙向綁定動作正確
- [ ] 沒對應 type 的 pill 顯示 disabled

---

## 4. 全域防窺模式（4-tier）

### Test 4.1: 切換動作零 React re-render

**場景**：toggle 防窺模式應只動 body[data-privacy]，不引發整樹 re-render。

**步驟**：
1. 開 DevTools React Profiler「Record」
2. 點右上眼睛 icon 切換 isPrivacyMode
3. Stop record

**預期反饋**：
- React Profiler 顯示只有 `PrivacyToggle` 元件本身 commit，其他元件 0 re-render
- body 元素的 `data-privacy` 屬性確實切換 `on` / `off`

**通過條件**：
- [ ] 只有 PrivacyToggle 重新 render
- [ ] CSS blur 效果立即生效（不延遲）

---

### Test 4.2: 首頁金額 blur(6px)

**場景**：開啟防窺後首頁所有 `<Money>` 包的金額應糊化。

**步驟**：
1. 開啟防窺
2. 逐項檢查：板塊卡「資產總額」/「本月剩餘額度」/「子帳戶餘額」/「本月明細金額」/「分類chip 上的金額」

**預期反饋**：
- 全部金額 blur(6px)
- 嘗試滑鼠拖選文字 → 拖不到（user-select: none）
- 嘗試 Ctrl+C → 剪貼簿是空字串

**通過條件**：
- [ ] 全站 `<Money>` 包的數字都模糊
- [ ] 複製貼上得到空字串

---

### Test 4.3: LINE 綁定 token blur(12px)

**場景**：`/settings → LINE 記帳綁定` 顯示的 userId 應走 strong blur。

**步驟**：
1. 開啟防窺
2. 到 `/settings`，滾到 LINE 綁定卡

**預期反饋**：
- LINE userId (U 開頭 32 字 hex) 的模糊**比一般金額更強**
- 看起來幾乎完全不可辨識（12px vs 6px 視覺差明顯）

**通過條件**：
- [ ] userId 強模糊 vs 一般金額弱模糊有視覺差
- [ ] DevTools 看 span 帶 `data-private-strong` 屬性

---

### Test 4.4: 訂閱頁 hero 數字 blur(12px)

**場景**：`/recurring` 頂部 3 看板巨幅數字應 strong blur（spec 明確要求 blur-md）。

**步驟**：
1. 開啟防窺
2. 到 `/recurring`

**預期反饋**：
- 「每月固定收入」「每月固定支出」「每月淨額」3 個大字 = blur(12px) strong
- 下方 list 內每筆 recurring 金額 = blur(6px) 一般

**通過條件**：
- [ ] hero 3 數字明顯比 list 數字模糊更強
- [ ] 視覺差有層次

---

### Test 4.5: 帳戶名稱 blur(4px)

**場景**：分類管理 / 個人設定 / 訂閱列表中的帳戶名應走 soft blur。

**步驟**：
1. 開啟防窺
2. 到 `/settings`
3. 看「個人設定 → LINE 主要帳戶」下拉
4. 看「分類管理 → 每筆 → 預設記到『XXX』」
5. 看「訂閱列表 → wallet icon 旁帳戶名」

**預期反饋**：
- 帳戶名稱輕模糊 blur(4px) — 比金額糊一點點但仍可隱約辨識
- 字色不變

**通過條件**：
- [ ] 帳戶名標籤的 wrapper 帶 `data-private` 屬性
- [ ] 模糊強度 < 一般金額

---

### Test 4.6: 防複製貼上偷看

**場景**：開啟防窺後 OCR / 複製貼上都不該洩露明文。

**步驟**：
1. 開啟防窺
2. Ctrl+A 全選網頁
3. Ctrl+C 複製
4. 貼到 Notepad / Apple Notes

**預期反饋**：
- 所有金額 / userId / 帳戶名 → 貼上是**空字串或亂碼**
- 文字選取在防窺區會顯示 transparent 看不到反白

**通過條件**：
- [ ] 複製出來不含任何明文金額
- [ ] 不含 LINE userId
- [ ] 不含帳戶名

---

## 5. 頂部導航欄通知中心

### Test 5.1: Pulse 點呼吸燈

**場景**：有待確認 placeholder 時 Bell 右上應出 amber 呼吸燈。

**前置**：手動產生 1 筆 placeholder（跑 materialize_due_recurrings 或直接 INSERT）。

**步驟**：
1. 重整首頁
2. 看右上角浮動 Bell 圖示

**預期反饋**：
- Bell 右上角 `size-2` 圓點 amber-500
- 圓點以 1.5s 週期 pulse 縮放（看一陣子可確認真的在動）
- 圓點外圍有 `ring-2 ring-background` 防色塊溶背

**通過條件**：
- [ ] 點亮的不是靜態，是有 pulse
- [ ] 沒待確認時 Bell 右上**完全沒有**圓點

---

### Test 5.2: Popover 開啟

**場景**：點 Bell 應彈出 Apple 深色毛玻璃 Popover。

**步驟**：點右上 Bell

**預期反饋**：
- Popover 由上往下淡入（zoom-in-95 + fade）
- 背景色 #09090b zinc-950 95% 透明 + backdrop-blur-md
- border zinc-800
- Header「週期性收支待確認」+ 右側 amber chip「N 筆」
- Body 內 N 個 row 各帶 input + ✓ + ✎ 按鈕
- Footer 提示「💡 直接在輸入框改金額，按 ✓ 即可核銷」

**通過條件**：
- [ ] Popover 是毛玻璃半透明（看得到後面內容隱約）
- [ ] 動畫流暢無閃爍

---

### Test 5.3: Inline 改金額 + ✓ 核銷

**場景**：在 Popover 內改金額後按 ✓，placeholder 應更新為實付。

**步驟**：
1. 在某 row input 把預估金額 10000 改成 11200
2. 觀察 input ring 是否轉 amber-500/40 (表示已 changed)
3. 按 ✓

**預期反饋**：
- 按下 ✓ 瞬間 Android 收到 20ms 沉穩震動
- Toast「已核銷週期：大寶月費（預估 $10,000 → 實付 $11,200）」
- 該 row 從 Popover **向左滑出消失**（exit x: -80, opacity 0, 250ms）
- 350ms 後首頁所有相關數字 router.refresh

**DB 驗證**：
```sql
SELECT amount, fulfillment_state FROM transactions
 WHERE description = '大寶月費'
   AND date::text LIKE to_char(current_date, 'YYYY-MM') || '%';
```

**通過條件**：
- [ ] amount 從 10000 → 11200
- [ ] fulfillment_state placeholder → confirmed
- [ ] Android 震動有感
- [ ] Slide-out 動畫順暢

---

### Test 5.4: ✎ 編輯按鈕 — 快速進入編輯模式

**場景**：點 ✎ 應該聚焦 input 並全選便於改金額。

**步驟**：點某 row 的 ✎

**預期反饋**：
- input 立刻 focus
- input 內文字全選反白
- input ring 變 amber-500/40
- 不會送出 form（不像 ✓）

**通過條件**：
- [ ] focus + select 動作正確
- [ ] 沒誤送 form

---

### Test 5.5: 全部核銷 → 🎉 空狀態

**場景**：把當月所有 placeholder 核銷完，Popover 應變空狀態。

**步驟**：把所有 placeholder 核銷掉

**預期反饋**：
- Bell pulse 點消失
- 重開 Popover 顯示：
  ```
  🎉
  太棒了！
  本月週期性開銷已全數核實完畢
  ```
- emerald-300 文字

**通過條件**：
- [ ] pulse 點消失
- [ ] 空狀態 PartyPopper icon + emerald 文字出現

---

## 6. 數據即時連動

### Test 6.1: 核銷後 router.refresh

**場景**：核銷後不需手動重整，全站數字應立刻更新。

**步驟**：
1. 開兩個分頁：A 開首頁、B 開 `/analytics`
2. 在 A 用 Bell 核銷一筆 placeholder
3. 切到 B 觀察

**預期反饋**：
- A 首頁：板塊卡「本月已支出」立刻跳新值（如 placeholder 從 10000 → 11200，多 1200）
- A 首頁：「本月剩餘額度」對應減少
- B 分析頁：MonthHeadlineCards「本月總支出」+ Burn Rate / 跨月趨勢圖 / 分類圓餅 全部跟著更新

**通過條件**：
- [ ] 沒手動重整就跟著動
- [ ] AnimatedNumber 從舊值滑動到新值（不是跳）

---

### Test 6.2: Recharts 500ms 動畫

**場景**：圖表數據變動時應走 500ms 平滑過渡，不是瞬切。

**步驟**：
1. 開分析頁
2. 切時光機 navigator 到上個月再切回本月
3. 觀察跨月趨勢 Bar / Line / 分類 Pie

**預期反饋**：
- Bar 高度 500ms 從 0 長到目標值（不是瞬間 pop）
- Line 路徑「畫」出來（左到右）
- Pie 扇區從 0 角度旋轉展開到目標角度
- AnimatedNumber 同步 0.9s 滾動

**通過條件**：
- [ ] 動畫平滑 500ms（不是瞬切）
- [ ] DailySpendChart Bar 例外保留靜態（per 已知設計限制）

---

### Test 6.3: 不打 LINE Push（web 核銷）

**場景**：web 端核銷只該前端跳數字，不該打 LINE。

**步驟**：
1. 用 Bell Popover 核銷一筆
2. 等 30 秒
3. 檢查 LINE 對話紀錄

**預期反饋**：
- LINE **完全沒收到任何訊息**
- 不該誤觸發任何主動 push

**通過條件**：
- [ ] LINE 對話框安靜
- [ ] Web 端正常顯示 toast「已核銷週期」

---

## 7. PWA 行動端全面屏封裝

### Test 7.1: iOS 加到主畫面

**前置**：Vercel deploy 完成 + `public/` 6 個 icon 在位（apple-icon.png 等）。

**步驟**：
1. iPhone Safari 開網址
2. 分享 → 「加到主畫面」
3. 看主畫面 icon

**預期反饋**：
- 主畫面圖示是你 logo（apple-icon.png）
- 名稱顯示「Money Radar」

**通過條件**：
- [ ] icon 是正確的 logo，**不是**通用截圖
- [ ] 名稱 = Money Radar

---

### Test 7.2: iOS PWA 開啟 — standalone + 狀態列融合

**步驟**：點主畫面 Money Radar icon 開啟

**預期反饋**：
- **全螢幕**：看不到 Safari 網址列、上下工具列、tab bar
- **狀態列融合**：頂部時間 / 訊號 / 電量列**透明融進純黑背景**（status-bar-style=black-translucent 生效）
- 內容延伸到狀態列下方（不是被推下去）

**通過條件**：
- [ ] 整片黑無工具列
- [ ] 時間 / 電量列看起來「飄」在內容上方而非有底色
- [ ] 旋轉裝置時不會自動橫向（orientation=portrait 鎖直）

---

### Test 7.3: Android Chrome PWA install prompt

**步驟**：Android Chrome 開網址 → 三點選單

**預期反饋**：
- 看到「安裝應用程式」/「Install App」選項
- 點下去彈窗顯示 icon-512 PNG + 「Money Radar」名稱

**通過條件**：
- [ ] install prompt 有出現（沒出來 = manifest 路徑或 icon 不對）
- [ ] Install 後從主畫面開也是 standalone 全螢幕

---

### Test 7.4: theme_color 套用

**步驟**：Android Chrome 開網頁（不是 PWA 模式）

**預期反饋**：
- 瀏覽器地址列頂部那條 thin status bar **背景變 #09090b**（zinc-950）
- 跟內容黑色融成一片

**通過條件**：
- [ ] 不是預設白色或 Chrome 灰

---

## 8. Haptic 觸覺回饋

### Test 8.1: 支出/收入 Tab 切換 10ms（Android）

**前置**：Android 手機 + Chrome 開 PWA

**步驟**：
1. 到 `/analytics`
2. 滾到「本月花費分類」卡
3. 點 segmented control 從「💸 支出」切到「💰 收入」

**預期反饋**：
- 點下去後 0.2s 後手指收到**極輕微震動**（10ms）— 對應 spring 380/30 落點吸附
- 滑塊 spring 動畫流暢
- 圖表 0.2s fade 換成收入結構

**通過條件**：
- [ ] Android 真的有微震
- [ ] 震動發生時機在動畫**落點後**而非按下瞬間

---

### Test 8.2: Bell 核銷確認 20ms（Android）

**步驟**：Android 開 Bell Popover，按某 row 的 ✓

**預期反饋**：
- 按下瞬間（不是延遲）收到 20ms 沉穩震動
- 比 8.1 的 10ms「**重一點**」有可感差異

**通過條件**：
- [ ] 觸感比 select tab 強
- [ ] 即時觸發（沒延遲）

---

### Test 8.3: iOS 靜默 no-op

**場景**：iOS 平台 WebKit 不支援 navigator.vibrate，應靜默不崩。

**步驟**：iOS Safari 進 PWA，重複 8.1 和 8.2

**預期反饋**：
- 手指**沒有任何震動**（這是平台限制不是 bug）
- DevTools console **沒有任何 error / warning**
- 切 tab / 按核銷功能正常動作

**通過條件**：
- [ ] iOS 不震動但功能正常
- [ ] Console 無錯誤

---

### Test 8.4: 長按進入編輯模式震動（Android）

**步驟**：Android PWA 進首頁，長按任一板塊卡 0.5 秒

**預期反饋**：
- 500ms 後收到 20ms 震動（同 8.2 的 success）
- 同時 3 張卡開始 jiggle

**通過條件**：
- [ ] 震動時機 = 進入編輯模式瞬間（同步）

---

## 9. 卡片發抖 + Reorder + Emoji 自訂

### Test 9.1: 長按 0.5s 觸發編輯模式

**場景**：iOS App icon 編輯經典互動。

**步驟**：桌面長按板塊卡 0.5 秒

**預期反饋**：
- 500ms 後進入編輯模式
- 右上「⚙️ 編輯排版」按鈕變成 emerald-500 底「✓ 完成編輯」
- 3 張卡開始 jiggle

**通過條件**：
- [ ] 真的要長按 0.5s 才觸發（短按不會誤觸）
- [ ] 移動手指離開卡會取消長按計時

---

### Test 9.2: Jiggle 動畫 — 隨機 phase

**場景**：3 張卡不該同步抖動，看起來才真實。

**步驟**：進入編輯模式後盯著 3 張卡看 5 秒

**預期反饋**：
- 3 張卡都在 ±0.5° 範圍微微旋轉
- 但**各卡的左右擺動 phase 錯開**（不是 1-2-3 同步）

**通過條件**：
- [ ] 不是機器人式同步擺動
- [ ] 角度確實在 ±0.5° 內（細微，不誇張）

---

### Test 9.3: Reorder.Group 拖拉

**場景**：拖一張卡從位置 1 拖到位置 3。

**步驟**：
1. 編輯模式下，按住第一張卡
2. 拖到第三張卡的位置
3. 放開

**預期反饋**：
- 拖動過程：
  - 滑鼠光標 grabbing
  - 被拖的卡 scale 1.03 + box-shadow 抬升
  - 其他卡會自動讓位（layout 動畫）
- 放開瞬間：卡片落回 grid 對應位置
- Toast 不出現（成功就靜默），DB 持久化

**DB 驗證**：
```sql
SELECT id, name, sort_order FROM dashboard_plates
 WHERE user_id = '<your uuid>' ORDER BY sort_order;
-- 預期看到 sort_order 跟拖完後的順序對齊
```

**通過條件**：
- [ ] 拖拉視覺平滑無閃爍
- [ ] DB sort_order 正確更新
- [ ] 重整頁面後順序保留

---

### Test 9.4: Emoji Popover 自訂

**場景**：在編輯模式下點板塊 emoji，跳出 20 選 1 Popover。

**步驟**：
1. 編輯模式下，看到 emoji 區外圈有 emerald 環 + 右下小 pencil badge
2. 點 emoji 區
3. Popover 跳出 4×5 grid

**預期反饋**：
- Popover 是毛玻璃深色背景
- 20 個 emoji 包含：🏠 👦 💰 🛡️ 📈 ☕ 👨‍💼 🐷 🎯 🏥 🎓 🧓 🚗 🍱 ✈️ 💎 🎮 🎁 ❤️ 📚
- 當前選中 emoji 有 emerald 高亮 ring
- 點新 emoji → 卡片頂部 emoji 立刻變 + Android 收到 10ms 微震 + Popover 關閉

**DB 驗證**：
```sql
SELECT name, emoji FROM dashboard_plates
 WHERE user_id = '<your uuid>' ORDER BY sort_order;
```

**通過條件**：
- [ ] 卡片 emoji 立刻換
- [ ] DB emoji column 寫入新值
- [ ] Android 收到震動

---

### Test 9.5: 樂觀更新 + 失敗回滾

**場景**：DB 寫入失敗時 UI 應自動回滾。

**步驟**：
1. 拔網路 / 開 DevTools 模擬離線
2. 編輯模式下拖一張卡到新位置
3. 放開
4. 等 1 秒看反應

**預期反饋**：
- 拖完瞬間卡片視覺已到新位置（樂觀更新）
- 1 秒內 toast「排序儲存失敗」+ description 帶錯誤訊息
- 卡片自動 router.refresh() **回到原本順序**

**通過條件**：
- [ ] 失敗有 toast 提示
- [ ] 視覺最終跟 DB 一致（不會留下「鬼順序」）

---

### Test 9.6: 「✓ 完成編輯」退出

**步驟**：在編輯模式按右上「✓ 完成編輯」

**預期反饋**：
- 3 張卡停止 jiggle，回正
- 右上按鈕變回「⚙️ 編輯排版」
- emoji 區的 emerald ring + pencil badge 消失
- 點 emoji 再次變成「無反應」（不是 Popover）

**通過條件**：
- [ ] 退出後所有編輯模式視覺都消失
- [ ] 點卡片回到正常瀏覽行為

---

## 10. 附錄：跨模組綜合驗證

### Test 10.1: 防窺模式 × 即時連動

**場景**：開啟防窺 + 從 Bell 核銷一筆 → 數字跳動仍是模糊的。

**通過條件**：
- [ ] 核銷瞬間 AnimatedNumber 滑動但全程模糊
- [ ] 不會在動畫過程「漏出」明文

---

### Test 10.2: PWA + Haptic + 編輯模式三件套

**場景**：Android PWA 模式長按板塊進編輯 → 震動 + 全螢幕 + 拖拉。

**通過條件**：
- [ ] 三項功能同時順暢無互打
- [ ] 不會因為 standalone 模式而長按失效

---

### Test 10.3: LINE 多筆收入 → 收入多元化智囊

**場景**：當月實際入帳 ≥ 3 種 income_category 後分析頁應出多元化 alert。

**步驟**：
1. LINE 連發：`薪水 50000` / `接案 8000` / `配息 2000`
2. 到 `/analytics`

**預期反饋**：
- 月度總覽「財務彈性」卡內出現 emerald「💡 收入多元化表現優異」
- 顯示 nonWagePct（非工資佔比）≥ 10%

**DB 驗證**：
```sql
SELECT description, amount, income_category FROM transactions
 WHERE type = 'income' AND date::text LIKE to_char(current_date, 'YYYY-MM') || '%'
 ORDER BY created_at DESC;
```

**通過條件**：
- [ ] 3 筆 income_category 各對 (salary / side_hustle / investment)
- [ ] 多元化 alert 出現

---

## 11. 已知 cross-platform 限制

| 功能 | 限制 | 影響 |
|---|---|---|
| Haptic (navigator.vibrate) | iOS Safari **不支援** | iOS 用戶感受不到震動但功能正常 |
| Reorder.Group 拖拉 | 手機端**未啟用**（只在 md+ desktop） | 手機 v1 走 Tabs 看單張卡，編輯排版 v2 再做 |
| PWA install prompt | iOS Safari 沒有原生 prompt（需手動「加到主畫面」）| Android 有 banner、iOS 要教使用者步驟 |
| Recharts daily-spend Bar 動畫 | per-cell stroke 跟動畫互斥 | 該 chart 保留靜態 |
| 防窺 ::selection 透明 | 部分 Linux 瀏覽器仍可選 | 邊緣 case 接受 |

---

## 12. 通過總結

完成所有 ✅ 後此清單列為「v1.0 驗收通過」。發現的問題另開 GitHub issue 引用對應 test ID（例如 Test 5.3）方便追蹤。

**Crafted with 🔬 — 蹂躪過了才知道是不是真的好東西。**
