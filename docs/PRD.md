# 📡 Money Radar 產品需求文件 (PRD)

> 個人 / 家庭財務戰情室 — 把 LINE AI 記帳、多帳戶現金分流、淨資產覆盤、預算熔斷分析整合在同一個 Apple 風指揮室。

| 項目 | 內容 |
|---|---|
| 文件版本 | v1.0 (2026-06-04) |
| 文件性質 | **逆向 PRD** — 從現有代碼回填的正式產品規格，作為持續迭代基準 |
| 適用對象 | 開源 contributor / 面試展示 / 未來功能規劃 |

---

## 1. 緒論

### 1.1 文件目的

Money Radar 在開發過程中採用「**先實作驗證、再回填規格**」的精實路徑，本文件將累積的 16 個 migration、30+ 個業務元件、6+ 個圖表類型、3 條 LINE AI pipeline 整理成正式 PRD，作為：
1. 開源使用者理解系統設計的入口
2. 未來新功能的設計參考基準
3. 求職 / 作品集展示產品思考深度

### 1.2 產品願景 (Vision Statement)

> **「給每個家庭一個 BI 戰情室」** — 用 AI 把記帳的摩擦降到零，用視覺化把分析的複雜度降到一眼即懂，用自動化把決策的判斷負擔降到只剩「要不要照做」。

### 1.3 產品定位

| 維度 | 定位 |
|---|---|
| **市場類別** | 個人理財管理工具 (PFM, Personal Finance Management) |
| **差異化** | LINE 一句話即記帳 × 多帳戶現金分流 × 6 維度自動分析 × 跨月歷史時光機 |
| **與簡單記帳 App 區別** | 不只「記」，自動產生健康度評分 + 行為建議 |
| **與企業 BI 區別** | 零設定、AI 入帳、預設模板就跑得起來；非 Notion / Google Sheet 那種手動苦力 |

---

## 2. 目標用戶 (Personas)

### Persona A：雙薪家庭 PM「Austin」(38)
- **狀況**：夫妻共同帳戶 + 個人帳戶 + 補助專戶 + 小孩學費。每月開銷 5 種類別，光對帳就崩潰
- **痛點**：CWMoney 太簡陋、Excel 太累、企業 BI 不適合家庭
- **期待**：LINE 一句話完成記帳、首頁一打開就知道「這月還能花多少」、跨月趨勢圖看儲蓄率達標沒
- **核心場景**：
  - 在 LINE 群組裡傳「晚餐 500 台新」→ 自動歸類餐飲、扣台新帳戶
  - 月底花 1 分鐘拍快照 → 淨資產趨勢圖自動連點成線
  - 觸發「硬性負擔率 > 60%」警示 → 收到 AI 智囊建議重整固定開銷

### Persona B：開源 fork 嘗鮮者「Dev」(28)
- **狀況**：對開源 PFM 工具好奇，想 fork 來改造
- **痛點**：大部分開源財務工具 UI 都「90 年代風」、文件不全
- **期待**：clone 完照 README 一步步跑得起來、首頁一鍵填假資料就能看到精緻 UI
- **核心場景**：
  - 一鍵 Demo Mode 注入 6 個月模擬資料 → 立刻看到所有圖表的正常狀態
  - 圖表沒資料時看到精緻空狀態而非崩潰

### Persona C：示範給 PM 看戰情室的開發者「九百五」
- **狀況**：在咖啡廳給朋友 demo「我的個人理財神器」
- **痛點**：不想露出真實財富數字，但又想展示系統的厲害
- **期待**：一鍵防窺、demo 過程中所有金額糊化但量級 / 結構保留
- **核心場景**：
  - 點右上眼睛 icon → 全站金額瞬間糊化、圖表 tooltip 連動模糊、複製貼上選不到明文

---

## 3. 核心理念與設計原則

### 3.1 分離帳戶理財法（系統世界觀）

採用「**分離帳戶**」的家庭理財模型 — 不同用途的錢放不同帳戶，避免互相吃掉：

```
個人財務板塊  ← 個人薪資 / 個人開銷 / 向共同戶轉出
家庭財務板塊  ← 共同戶 / 房貸 / 托育 / 學費 / 共同生活
補助金流板塊  ← 政府補助 / 被動收入 / 兒童專戶
```

每個板塊綁定 1-N 個 cash flow accounts（如台新共同戶、中信薪資戶、合庫老婆戶、現金錢包等）。

### 3.2 設計原則

| 原則 | 落地實踐 |
|---|---|
| **Zero-Friction Input** | LINE 一句人話完成記帳；語音、發票圖片 multi-modal 通吃 |
| **One Hero Color Per Card** | Apple/Linear 哲學 — 每張卡只有一個 hero number 染色，其餘走 zinc 沉穩 |
| **Defense-in-Depth Privacy** | CSS-only 防窺零 React re-render；4 階模糊強度分層 |
| **Data-Driven, No Hard-Coded Categories** | 板塊 / 分類 / 預設帳戶全部使用者可改，DB 完全 data-driven |
| **Dark-First, Light-Friendly** | 主視覺為深色 Apple 風；淺色模式仍可用但非主戰場 |
| **Graceful Degradation** | API key 不存在 / migration 沒跑 → UI 不崩潰、降級為靜態 fallback |

---

## 4. 功能總覽 (Feature Matrix)

| # | 模組 | 主要使用者 | 觸發場景 | 關鍵 KPI |
|---|---|---|---|---|
| 1 | **LINE 多模態 AI 記帳** | 全體 | 隨手記、語音記、發票記 | 記帳完成率、解析準確率 |
| 2 | **首頁戰情室（動態板塊）** | 全體 | 每日首頁打開 | 「本月剩餘額度」一眼可見率 |
| 3 | **三維付款方式** | 進階用戶 | Quick Add / LINE | 自動正確判付款方式比率 |
| 4 | **多帳戶資產整合看板** | 多帳戶家庭 | 首頁查看現金分流 | 子帳戶餘額對帳準確率 |
| 5 | **6 維度分析報表** | 月度檢視 | 月底覆盤 | 健康度評分變化趨勢 |
| 6 | **淨資產戰情室** | 長期投資者 | 月底拍快照 | 月增長率追蹤 |
| 7 | **夢想基金** | 儲蓄目標族 | 設定大額目標 | 達標 / 進度條 |
| 8 | **週期性收支 + Placeholder 核銷** | 固定支出多者 | 月底實付對帳 | placeholder → confirmed 轉換率 |
| 9 | **通知中心 (Bell)** | 全體 | 隨時提醒 | 待確認 backlog 清空率 |
| 10 | **4-tier 防窺模式** | demo 場景 | 給人看 / 公共場合 | 切換流暢度（零 re-render） |
| 11 | **桌面摺疊側邊欄** | 桌面重度用戶 | 想看更寬圖表 | 寬度釋放滿意度 |
| 12 | **Demo Mode** | 開源 fork 用戶 | 首次 setup | 「3 秒看到正常 UI」達成率 |

---

## 5. 詳細功能規格

### 5.1 模組：LINE 多模態 AI 記帳

#### 5.1.1 文字記帳

**使用者故事**：
> 作為一個忙碌的家長，我希望在 LINE 對話框打一句話就能完成記帳，避免下班還要打開 App 翻分類選帳戶。

**功能規格**：
- LLM (Gemini 2.0 Flash) 解析使用者中文訊息，輸出嚴格 JSON：
  ```json
  { "item": string, "amount": number, "account_override": string | null,
    "category": string | null, "payment_method": "cash"|"credit_card"|"transfer" }
  ```
- regex parser 為 fallback（LLM 失敗 / timeout 3.5s）
- 收入意圖偵測：26 個關鍵字（領到 / 補助 / 薪水 / 退稅⋯）零成本判 type

**驗收條件**：
- ✅ 「晚餐 500 台新」→ 歸 food_dining、扣台新、payment_method=transfer
- ✅ 「午餐麥當勞 uber 信用卡 299」→ 食物優先於 Uber 交通（不誤判 transport）
- ✅ 「安全帽 現金 1200」→ 扣現金錢包、payment_method=cash
- ✅ LLM 失敗時走 regex fallback，至少能抽 amount + title

#### 5.1.2 語音記帳

**使用者故事**：
> 開車不能打字，希望錄音傳給 LINE 就能完成記帳。

**功能規格**：
- 用戶傳 LINE audio message → 下載音檔 → OpenAI Whisper STT → 轉文字 → 走 5.1.1 流程
- Reply 帶 prefix「🎙️ 語音辨識成功：「<原話>」」讓用戶確認辨識結果

#### 5.1.3 發票圖片記帳

**使用者故事**：
> 拍張發票就能批次記入購物清單。

**功能規格**：
- 用戶傳 LINE image → GPT-4o Vision 抽 N 筆 invoice items → 批次 INSERT
- 每筆獨立分類 + 自動走 fallback chain 找帳戶
- 同帳戶連續多筆只在第一筆顯示帳戶後綴（減 reply 冗長）

#### 5.1.4 智慧路由 — 7 階 fallback chain

**設計原則**：使用者明示 > 系統推導 > 保底預設。

```
1. LLM account_override          (「晚餐 120 台新」→ acc-taishin)
2. paymentMethod=cash            → 第一個 type='cash' 帳戶
3. paymentMethod=credit_card     → 第一個 type='credit_card' 帳戶
4. categories.default_account_id (「水電」分類綁台新)
5. profiles.default_account_id   (帳號層 singleton)
6. accounts id 字典序第一筆      (保底)
```

#### 5.1.5 Placeholder 核銷比對

**使用者故事**：
> 我已設定「大寶幼兒園月費 10000」週期；每月實際金額會浮動（11200）；希望 LINE 補繳訊息能自動覆蓋預估值，不要重複記兩筆。

**功能規格**：
- LINE expense INSERT 前先查當月 `fulfillment_state='placeholder'` 交易
- 用 `scoreMatch(description, item) ≥ 80` 對配（hay 完整包含 needle）
- 命中 → UPDATE amount + state='confirmed' + payment_method；reply 帶 delta「預估 $10,000 → 實付 $11,200」

---

### 5.2 模組：首頁戰情室

#### 5.2.1 動態板塊 (Plates)

**使用者故事**：
> 我希望首頁長相是「個人 / 家庭 / 補助」這三個獨立帳本而非一鍋亂粥；板塊可以自訂增刪。

**功能規格**：
- `dashboard_plates` 表 + 4 條 RLS policy
- 每位 user 上限 4 個板塊（首頁版位限制）
- 新會員 sign-up trigger 自動 seed 3 個預設板塊（家庭/補助/個人）
- 板塊與 accounts 走 **N:1 multi-binding**（一個板塊綁多個帳戶 — per migration 0013）
- mobile Tabs 切換 / desktop grid 排列 — TabsList grid-cols 1-4 動態

#### 5.2.2 資產整合看板（板塊內）

**規格**：
- 卡片頂部顯示「資產總額」大字 = 該板塊所綁定 accounts.balance 加總（信用卡負餘額自動扣減 → 淨值語意）
- 下方分隔線 + flex-between 子帳戶列表：左 type icon + 帳戶名 / 右金額
- 負餘額自動 rose 染色、其他走 zinc 中性

#### 5.2.3 三層核心指標卡

每板塊內顯示 3 個 metric：
1. **本月可支配預算** = 固定收入 − 固定支出（從 recurring_payments 加總）
2. **本月已支出** = 當月 expense + status=completed 加總
3. **本月剩餘額度** = 預算 − 已支出（hero 染色：positive emerald / danger rose）
+ 預算消耗進度條（safe/warn/alert tier 染色）

#### 5.2.4 訂閱扣款警報

**規格**：
- `SubscriptionAlertWidget` 智慧靜默：≤7 天內到期才出現
- Vercel Cron 每日 09:00 掃描 → 3 天內到期 → LINE 主動 push

#### 5.2.5 夢想基金摘要連結

**規格**：
- 首頁顯示微型版（current / target / 進度條），點擊跳 `/goals` 看完整管理

---

### 5.3 模組：三維付款方式 (Cash / Credit Card / Transfer)

#### 5.3.1 資料模型

- `transactions.payment_method` CHECK IN ('cash','credit_card','transfer') (per 0012)
- `accounts.type` 擴 'cash'，auth.users trigger 自動 seed「現金錢包」(per 0012)
- 0014 把現金錢包自動綁進「個人財務」板塊（新會員 + 既有 backfill）

#### 5.3.2 Quick Add — 雙向綁定 Segmented Control

**使用者故事**：
> 我點「💳 刷卡」應該自動切到信用卡帳戶；點現金帳戶應該自動標 💵。

**規格**：
- Segmented Control: `💵 現金 / 💳 刷卡 / 🏦 轉帳`
- 雙向綁定：選 paymentMethod → 切第一個對應 type 帳戶；選帳戶 → 反向設 paymentMethod
- 沒對應 type 帳戶的 pill 顯示 disabled (opacity-40)

#### 5.3.3 明細頁付款方式 badge

- 金額右側小圓 badge：Banknote / CreditCard / Landmark icon
- 低飽和 `bg-foreground/[0.05] text-muted-foreground ring-foreground/10`，不搶分類色

---

### 5.4 模組：6 維度分析報表 (`/analytics`)

兩個 Tab：月度總覽 + 單日透視。

#### 5.4.1 月度總覽 — 7 段順序（per Phase: 版面洗牌）

```
時光機 navigator (Month picker)
↓
(1) 本月核心數據大字報 (3 欄)
(2) 本月花費分類 (Donut)
(3) 吸血鬼排行榜 (Top Merchants)
(4) 本月現金流向圖 (Sankey)
(5) 當月每日花費透視 (Stacked Bar)
(6) 財務彈性 - 固定 vs 浮動
(7) 近 6 個月財務趨勢 (壓軸)
```

**(1) 本月核心數據大字報**：
- 本月總支出 (rose 大字 + MoM 變動 pill 逆向染色)
- 本月總收入 (emerald 大字)
- 當月儲蓄率 (tier 染色：≥20% emerald / ≥0 zinc / <0 rose)

**(6) 財務彈性**：
- 甜甜圈 (固定 vs 浮動) + 硬性負擔率 = 固定支出 ÷ 總收入
- tier 染色 + AI 智囊建議：
  - safe (< 30%) → 「彈性絕佳」鼓勵投資
  - watch (30-60%) → 「可控區間」建議檢視
  - alert (> 60%) → 「警戒」建議重整
- **本月零收入防呆**：totalIncome=0 但有支出時，攔截 tier 判斷改顯示黃色「燒存量」預警

**(7) 跨月趨勢**：
- 雙 Y 軸 ComposedChart：Bar（收入/支出）+ Line（儲蓄率）
- 灰色虛線顯示 `profiles.target_savings_rate` 用戶設定的儲蓄率目標
- 持續 ≥ 20% 標為穩健

#### 5.4.2 單日透視

**規格**：
- 日期 cursor navigator (< 日期 > 今天)
- 今日 Hero 大字報（取代右上角紅字 chip — 視覺焦點重組）
- **💡 今日智囊覆盤** 區塊（per Phase: Daily Advisor）
  - **Burn Rate 4 階染色**：今日支出 ÷ (每月預算 ÷ 該月天數)
    - <0.5 emerald「自由配額還多」
    - ≤1.0 emerald「仍在配額內」
    - ≤2.0 amber「透支未來 N 天配額」
    - >2.0 rose「嚴重透支」
  - **消費時間軸**：item.createdAt asc 排序，垂直線 + 6 段時段 bucket
    - 早餐 06-10 / 午間 11-13 / 下午茶 14-16 / 晚間 17-20 / 宵夜 21-25 / 深夜
  - **大額預付異常 inline hint**：item.amount > dailyBaseline × 3 時顯示 indigo Sparkles 提示 + Mock「跨月分攤」按鈕（per spec Mock，按了不動作）
- 分類卡內每筆交易：title + 帳戶 + 金額（zinc-200 中性色，預留 isOverBudget 鉤點才轉 rose）

---

### 5.5 模組：淨資產戰情室 (`/net-worth`)

**使用者故事**：
> 我每月底花 1 分鐘拍下各帳戶殘值，希望這些快照能連成一條漂亮的爬升曲線。

**規格**：
- 月度低頻寫入 vs 首頁高頻現金流 — 存量 vs 流量分家
- 📸 「更新本月資產快照」Dialog — 一鍵填入所有 wealth_account 殘值
- 3 大卡：總資產 (emerald) / 總負債 (rose) / 淨資產 (含 MoM 月增長率 ▲ +X.X%)
- 趨勢 Area Chart + 資產配置 Pie (10 色 Apple palette)
- **DB 端 invariant**：`wealth_snapshots.net_worth GENERATED ALWAYS AS (total_assets - total_liabilities) STORED` — 算術強制一致，應用層改不到
- `(user_id, recorded_at)` UNIQUE → 同日 re-submit UPSERT 覆蓋

---

### 5.6 模組：夢想基金 (`/goals`)

**規格**：
- 「想要」可量化為目標：name / target / current / deadline / image
- 進度條 + 倒數天數 + 達標彩帶 (canvas-confetti)
- 不混進 transactions 表 — 「儲蓄分配」是抽象概念
- LINE「提撥 / 夢想基金 X」可從聊天直接加進度

---

### 5.7 模組：訂閱 + 週期性收支

#### 5.7.1 設定週期性扣款

**規格**：
- title / amount / type (income|expense) / frequency / next_due_date / account_id / category
- frequency 支援 daily / weekly / biweekly / monthly / quarterly / semi_annually / yearly

#### 5.7.2 Placeholder 雙態 — `materialize_due_recurrings()` (per 0015)

**使用者故事**：
> 月初我設定「房貸 25000 月扣」；月底實際金額有時帶利息變動；希望系統先 placeholder 預扣 25000 給預算計算，等實付時用 LINE 一句話覆蓋成 25130。

**規格**：
- `transactions.fulfillment_state` NULL | 'placeholder' | 'confirmed' (per 0015)
- `recurring_payment_id` FK + `recurring_period` (YYYY-MM) + partial UNIQUE 防同月重複
- `materialize_due_recurrings()` PL/pgSQL function：
  - 遍歷 user 所有 next_due_date <= today 的 recurring
  - INSERT placeholder transaction (status=completed + state=placeholder)
  - 推進 next_due_date 一個 cycle (依 frequency)
- 每次 loadDashboard 自動 RPC call — 0 變動時 < 1ms

#### 5.7.3 編輯儲存即視為核銷

- TransactionRowActions 偵測 fulfillmentState='placeholder' → dialog 標題改「核銷週期扣款」+ 🪄 hint
- handleSubmit 自動帶 `fulfillmentState: 'confirmed'`，無需另加按鈕
- toast 顯示「已核銷週期」而非「已更新帳目」

---

### 5.8 模組：通知中心 (Bell)

#### 5.8.1 浮動鈴鐺 + Pulse 點

**規格**：
- `fixed top-3 right-3 z-30` 跨 viewport 一致位置（mobile 浮動工具列同步避讓）
- 待確認 placeholder ≥ 1 時 amber-500 pulse 點 + ring-2 防色塊溶進背景

#### 5.8.2 Popover 內 inline 核銷

**規格**：
- 每筆 form row：input 預填 placeholder.amount + [✓][✎] 雙按鈕
- ✓ → submit form → updateTransaction({fulfillmentState:'confirmed'})
- ✎ → 聚焦 + 全選 input 進「快速編輯」模式（input ring 轉 amber）
- 樂觀 UI：confirmedIds set 觸發 AnimatePresence slide-left exit
- 失敗自動撤回 + toast 錯誤
- 350ms 後 router.refresh() 同步全站 RSC（避免動畫被打斷）

#### 5.8.3 空狀態

- 全部核銷完畢 → PartyPopper emerald icon + 「🎉 太棒了！本月週期性開銷已全數核實完畢」

---

### 5.9 模組：4-tier 全域防窺模式

#### 5.9.1 設計哲學

> 切換防窺只寫 `document.body.dataset.privacy = "on"`，整個 React 樹零 re-render。所有 `<Money>` / `<AnimatedNumber>` / Recharts 元件透過 CSS 一條 rule 統一處理。

#### 5.9.2 4 階強度分層

| 屬性 | 效果 | 用途 |
|---|---|---|
| `[data-private-strong]` | `blur(12px) + select-none + pointer-events-none` | LINE userId token、訂閱頁 hero 數字 |
| `[data-money]` (預設) | `blur(6px) + select-none + pointer-events-none` | 所有 `<Money>` 包裝的金額 |
| `[data-private]` | `blur(4px) + select-none` | 帳戶名、暱稱、機構識別標籤 |
| `[data-private-avatar]` | `grayscale(1) + opacity 0.2 + 0.3s transition` | 預留給未來頭像支援 |

#### 5.9.3 防 OCR / 防複製

- `user-select: none` + `-webkit-user-select` + `::selection { background: transparent }` 三層擋住複製貼上偷看
- Recharts SVG `<text>` + `.recharts-tooltip-wrapper` 整段一網打盡

---

### 5.10 模組：桌面 UX

#### 5.10.1 可摺疊側邊欄 (per Phase: Sidebar)

**規格**：
- 寬度切換：`w-64` ↔ `w-20`（展開 / 摺疊）；`transition-all duration-300 ease-in-out`
- `localStorage` 持久化使用者偏好；mounted guard 防 SSR hydration mismatch
- 摺疊時 logo 文字、nav item label、底部 toggle 標籤統一 `w-0/opacity-0` 漸隱
- **Hover-to-Reveal toggle 鈕**：
  - 預設 `opacity-0 scale-95 pointer-events-none` 完全隱藏
  - `group-hover` / `group-focus-within` / `focus-visible` 三層觸發喚醒
  - 浮在 sidebar 右邊緣 (`-right-3`) 跨越 border 形成「拉手」視覺
  - hover 時右邊框從 zinc-900 升 zinc-800 給「moody dark edge」回饋
- 摺疊狀態下 nav item 自動包 base-ui Tooltip(side=right) 顯示中文標籤
- 主內容 `<MainPad>` 同步 `md:pl-20` ↔ `md:pl-64`

#### 5.10.2 Recharts 動畫一致性

- 全站圖表 `isAnimationActive + animationDuration={500}` 統一
- 例外：`daily-spend-chart` Bar 與 `chart-empty-state` 因設計限制保留 `isAnimationActive={false}`

#### 5.10.3 圖表空白狀態防護

- `ChartEmptyState` 共用元件：半透明 mock 背景 + Lucide BarChart3 + 引導文字
- `currentColor` + opacity-[0.12] 自動跟 dark/light 主題走

---

### 5.11 模組：開發者體驗

#### 5.11.1 Demo Mode — 開箱即用

**使用者故事**：
> 我 fork 了 repo，第一次跑起來看到空儀表板很沮喪，希望一鍵塞示範資料就能看到所有圖表的正常狀態。

**規格**：
- **雙閘 env gate**：`NODE_ENV='development'` 或 `NEXT_PUBLIC_ENABLE_DEMO_SEED='true'` 二擇一才放行
- 一鍵注入 6 個月 × 7 筆樣板 = ~36 筆 [DEMO] 交易（amount ±15% jitter 自然抖動）
- 6 筆月底 wealth_snapshots（100 萬 → 125 萬漸層 UPSERT）
- [DEMO] 前綴標記方便清理：到 `/transactions` 搜尋 `[DEMO]` 批次找出來
- 漸層發光按鈕 + confirm dialog 強制讀完 4 條警告才放行

---

### 5.12 模組：個人設定 + Onboarding

#### 5.12.1 個人設定

- `display_name` → 首頁歡迎詞「歡迎回來，[暱稱]！」
- `target_savings_rate` → 跨月趨勢圖 ReferenceLine 灰色目標虛線
- `avatar_url` → 預留給未來頭像支援
- `default_account_id` → LINE fallback chain (C) 主帳戶

#### 5.12.2 Onboarding Wizard

- 新會員 `profiles.has_completed_onboarding = false` 時首頁條件 mount 3 步驟 Dialog
- 完成 / 跳過都翻 flag 不重複出現
- 老用戶 0009 migration backfill 為 true 不打擾

#### 5.12.3 任務清單（首頁掛件）

- Wizard 完成後在首頁顯示任務清單
- server-side 進度（has_plates / has_snapshots 自動勾）
- LS 進度（點過分類頁就勾）
- 三任務全完成走 CSS opacity + translate 淡出 500ms 後 unmount

---

### 5.13 模組：HelpTip Contextual Help

**規格**：
- 硬核功能（吸血鬼排行榜、財務彈性、儲蓄率）旁掛 `ℹ️` icon
- base-ui Tooltip 包 HelpTip，hover/tap 解釋公式與 tier 切分
- 解決「使用者不用回 README 也能讀懂自己的數字」

---

### 5.14 模組：忘記密碼 / 重設密碼

- `/forgot-password` 寄 OTP recovery 信
- `/update-password` 改完強制登出回登入頁（避免 token 殘留視窗繼續操作）
- Supabase recovery token 走 URL fragment，proxy whitelist 把 `/update-password` 加進 matcher 排除清單避免 redirect 剝離

---

### 5.15 模組：More Hub (行動版導覽)

**規格**：
- 手機底部 tab 5 格給高頻：首頁 / 分析 / 記帳 / 訂閱 / 更多
- 「更多」進中轉頁 `/(dashboard)/more` — 兩張漸層大卡（emerald 夢想 / slate 設定）
- 桌面 viewport 自動 `router.replace("/settings")`
- viewport rotation / resize 跟著 redirect (`matchMedia` listener)

---

## 6. 資料模型 (Data Model)

### 6.1 核心表 (16 個 migration 累積)

| 表 | 用途 |
|---|---|
| `auth.users` | Supabase Auth 內建 |
| `users` | 應急基金 threshold 等 user-scope 設定 |
| `profiles` | display_name / avatar / target_savings_rate / default_account_id / line_user_id / has_completed_onboarding |
| `accounts` | 多帳戶（type: bank / credit_card / cash） |
| `transactions` | 核心交易表（type / amount / payment_method / fulfillment_state / recurring_payment_id） |
| `recurring_payments` | 週期性收支模板（frequency / next_due_date） |
| `subscriptions` | 訂閱制扣款 + 警報雷達 |
| `categories` | 分類管理（is_fixed / budget_monthly / keywords / default_account_id） |
| `dashboard_plates` | 戰情室板塊（linked_account_ids TEXT[] 多帳戶綁定） |
| `goals` | 夢想基金（target / current / deadline） |
| `goal_logs` | 夢想提撥歷史 |
| `wealth_accounts` | 淨資產 buckets（type: asset / liability） |
| `wealth_snapshots` | 月度資產快照（net_worth GENERATED STORED） |
| `assets` / `debts` | 簡化版 wealth tracking（向後相容） |
| `system_settings` | 全域設定（safetyThreshold 等） |

### 6.2 重要 DB-side invariants

| 不變量 | 實作 |
|---|---|
| 多租戶隔離 | 所有業務表 RLS policy 強制 `auth.uid() = user_id` |
| 自動 user_id | `transactions.user_id` DEFAULT `auth.uid()` — 應用層繞不過 |
| 淨資產算術一致 | `wealth_snapshots.net_worth GENERATED ALWAYS AS (total_assets - total_liabilities) STORED` |
| 同日快照唯一 | `(user_id, recorded_at)` UNIQUE — UPSERT 覆蓋 |
| 同月 placeholder 唯一 | `(recurring_payment_id, recurring_period)` partial UNIQUE WHERE 非 NULL |
| 帳戶 type CHECK | `accounts.type IN ('bank','credit_card','cash')` |
| 付款方式 CHECK | `transactions.payment_method IN ('cash','credit_card','transfer') OR NULL` |
| 核銷狀態 CHECK | `transactions.fulfillment_state IN ('placeholder','confirmed') OR NULL` |

### 6.3 自動化 Trigger

| Trigger | 行為 |
|---|---|
| `on_auth_user_seed_categories_trg` | 新會員自動 seed 7 大 expense categories |
| `on_auth_user_seed_dashboard_plates_trg` | 自動 seed 3 個預設板塊；「個人財務」自動綁 cash account (per 0014) |
| `on_auth_user_seed_cash_account_trg` | 自動 seed 「現金錢包」帳戶（per 0012） |

---

## 7. 技術架構

### 7.1 前端

| 層 | 技術 |
|---|---|
| Framework | Next.js 16.2 (App Router + Turbopack) |
| Runtime | React 19 (Server Components + `use` hook) |
| Types | TypeScript strict mode |
| Styling | Tailwind CSS v4 + Apple-style design tokens |
| Headless UI | `@base-ui/react` 1.5 (Dialog / Select / Tabs / Tooltip / Popover) |
| Charts | Recharts 3.x (Line / Bar / Pie / Area / Sankey / ComposedChart) |
| Animation | Framer Motion 12 |
| Icons | lucide-react |
| Toasts | sonner |
| Theme | next-themes |

### 7.2 後端

| 服務 | 用途 |
|---|---|
| Supabase Postgres | 主資料庫 + RLS 多租戶隔離 |
| Supabase Auth | OAuth / email + cookie session |
| Supabase RPC | `materialize_due_recurrings()` 等 PL/pgSQL function |
| `@supabase/ssr` | RSC / proxy 共用 server client |
| Server Actions | 所有 mutation（revalidatePath 即時聯動） |

### 7.3 AI Pipeline

| 通道 | 服務 | 用途 |
|---|---|---|
| 文字解析 | Google Gemini 2.0 Flash | LINE bot JSON 抽取（item / amount / account / category / payment_method） |
| 語音 STT | OpenAI Whisper | LINE audio → 文字 |
| 發票 OCR | OpenAI GPT-4o Vision | LINE image → 多筆 invoice items |
| 收入偵測 | 26 中文關鍵字 | 零成本 type 判斷 |

### 7.4 自動化

- **Vercel Cron 每日 09:00** — 掃描 subscriptions 3 天內到期 → LINE push
- **`loadDashboard` 預跑 RPC** — 每次首頁載入自動 materialize 已到期 recurring（idempotent，重跑零副作用）

---

## 8. 環境變數

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role>  # webhook 寫入用

# LINE Bot
LINE_CHANNEL_ACCESS_TOKEN=<>
LINE_CHANNEL_SECRET=<>

# AI
OPENAI_API_KEY=<>     # Whisper + Vision
GEMINI_API_KEY=<>     # LINE 文字解析
GEMINI_MODEL=gemini-2.0-flash  # 可覆寫

# Vercel Cron
CRON_SECRET=<random-long-string>

# Demo Mode（fork 部署想對外展示就 true；本機 dev 不設也預設開啟）
NEXT_PUBLIC_ENABLE_DEMO_SEED=false
```

---

## 9. Roadmap

### ✅ 已完成 (v1.0)

- [x] LINE 多模態 AI 記帳 (text / voice / image)
- [x] 7 階智慧路由 fallback chain
- [x] 動態板塊 multi-binding (N:1)
- [x] 三維付款方式 + 現金錢包
- [x] 資產整合看板
- [x] 6 維度分析報表（含時光機）
- [x] 淨資產戰情室 + 月度快照
- [x] 夢想基金
- [x] 週期性收支 placeholder/confirmed 雙態
- [x] 通知中心 Bell + 浮層內 inline 核銷
- [x] 4-tier 防窺模式
- [x] 可摺疊側邊欄 + Hover-to-Reveal toggle
- [x] Demo Mode（fork 開箱即用）
- [x] 圖表空白狀態防護
- [x] Onboarding wizard + 任務清單
- [x] 重設密碼 OTP flow
- [x] More Hub 行動導覽

### 📋 規劃中 (v1.1+)

- [ ] LINE 推送預算警報（超預算分類自動提醒）
- [ ] 收入分類（薪資 / 副業 / 投資配息細分）
- [ ] 自訂 emoji + 拖拉排序 plates
- [ ] CSV / PDF 報表匯出
- [ ] 大額預付跨月分攤（目前是 Mock UI）
- [ ] LINE Profile API 接入頭像 + display name
- [ ] Plaid / Open Banking 自動串接帳戶
- [ ] PWA 離線記帳
- [ ] Webhook 失敗重試機制
- [ ] 多語系（英 / 日）

---

## 10. 附錄

### 10.1 Migration 索引

| Migration | 內容 |
|---|---|
| 0001 | transactions transfer + recurring_payments 升級 |
| 0002 | 種子帳戶 |
| 0003 | recurring frequency 加 semi_annually |
| 0004 | wealth_module (淨資產) |
| 0005 | transactions.category nullable |
| 0006 | categories.is_fixed |
| 0007 | dashboard_plates + RLS + seed trigger |
| 0008 | accounts.id DEFAULT 補回 |
| 0009 | profiles.has_completed_onboarding |
| 0010 | profiles 個人設定 3 欄位 |
| 0011 | categories / profiles default_account_id |
| 0012 | transactions.payment_method + cash account seed |
| 0013 | dashboard_plates N:1 multi-binding |
| 0014 | 現金錢包自動綁進個人財務板塊 |
| 0015 | recurring placeholder/confirmed 雙態 + materialize fn |

### 10.2 命名規範

- DB enum **一律 snake_case** (`food_dining` / `placeholder` / `credit_card`)
- TypeScript literal type 必須與 DB 字面值**一字不差**
- `accounts.id` / `recurring_payments.id` 是 TEXT 不是 UUID（早期建表決策）
- 多租戶 UPDATE/DELETE 一律 scope by `user_id`（RLS 加 explicit eq 雙保險）

### 10.3 已知技術限制

- LINE webhook 走 Next.js API Route，**需 `export const runtime = "nodejs"`**（per memory）
- Next 16 `middleware` 已改名 `proxy`（檔名 + function 都要換）
- base-ui `DialogTrigger render={<Button/>}` 會 silent 失效 → 一律走 controlled open
- Supabase SQL Editor 包整段 transaction → 避免 `DO block` + nested dollar-quote
- PG partial unique index 的 `ON CONFLICT` 必須重寫 WHERE 子句

### 10.4 設計參照

- **Apple HIG** — 字體層級、色彩節制、deep dark
- **Linear** — Sidebar 摺疊、Hover-to-Reveal toggle、Popover 毛玻璃
- **Notion** — More Hub 中轉頁、Plates 自訂結構

---

**Crafted with 🧠 by someone who got tired of crap finance apps.**
