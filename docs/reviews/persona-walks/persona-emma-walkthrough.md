# Emma 王太太 Persona Walkthrough Report

**Date**: 2026-07-03
**Reviewer**: Persona Emma 王太太（40 歲家庭 CFO / 兼職會計 — Excel PivotTable 熟練、看到不對稱金額會抓狂）
**Environment**: Next 16 Turbopack dev server @ http://localhost:3000（前後端同址；Server Actions + Supabase）
**Tool**: Playwright CLI（headless，viewport 1920×1080，pinned in-spec via `test.use({...})`）
**Login**: austin.hung@rfdme.com / Temp1234
**Run cmd**: `npx playwright test e2e/walkthrough/emma-persona.spec.ts --workers 1 --reporter list`

## Executive Verdict

- **能否日常使用**: ⚠（**灰色地帶**——UI 沒有 CRITICAL bug，但這個測試帳號的資料是**完全空的**，Emma 走進來看到「本月支出 $0 / 本月收入 $0」與「找不到任何帳目」，走不完設計者原本想 demo 的 4 個 UC；4/4 test 通過但**只驗證了空狀態呈現**，帳戶篩選 / 隔離 / 搜尋加總 / 批次改分類的**核心 credibility 都無法確認**）
- **迷路次數**: 3（`帳戶檢視範圍` strip 沒出現我以為壞了 / 隔離條沒出現我以為壞了 / 搜「醫療」全空我以為漏建 index）
- **總 anomalies**: 8（CRITICAL=0 / HIGH=1 / MEDIUM=4 / LOW=3）
- **跨模組可追溯性**: **N/A** — 因為兩邊都是 0，數字巧合對上等於什麼都沒驗到；**這是最需要 flag 的 gap**

---

## UC1: 進 /analytics 檢視月度總覽 + 切帳戶篩選

**情境**: 這個月 Emma 想看家裡花了多少。她習慣先進「分析報表」，掃一眼月度大字，然後切「家庭公庫」跟「隨身現金」對照，確認兩個帳戶都沒漏對帳。

**步驟**:

1. 登入後直接 `/analytics`
   ↳ Screenshot: `emma-uc1-step1-landing-all-accounts.png`
2. 掃 landing — 找「帳戶檢視範圍」slim strip
3. 記錄「全部資產總覽」狀態下畫面的數字指紋
   ↳ Screenshot: `emma-uc1-step2-fingerprint-all.png`
4. 試著切「家庭公庫」帳戶（找不到選項 — 因為只有 1 個帳戶）
5. 試著切「隨身現金 / 錢包」（同樣沒有）
6. 切回全部
   ↳ Screenshot: `emma-uc1-step5-back-to-all.png`

**觀察到的**:

- [PASS] 月度大字「本月總支出」/「本月總收入」框架存在（值是 $0）
- [PASS] 圓餅、Sankey、每日透視、財務彈性、跨月趨勢 6 大區塊 skeleton 都在，各自有空狀態文案
- [MEDIUM] **`帳戶檢視範圍` slim strip 條件性完全消失**（`accounts.length > 1` 才渲染）— 從 code 看是刻意，但 Emma 不知道；她會誤以為「這功能壞了」或「我還沒設定好」。建議即使只有 1 個帳戶也留一條 disabled state 的 strip，寫「目前只有 1 個帳戶，多開幾個以啟用切換」
- [LOW] Sidebar nav 上是「**分析**」，頁面標題是「**分析報表**」，pretitle 是英文 `ANALYTICS` — 三個名字指同一個東西
- [LOW] 「本月結餘」大字顯示 `—` 而非 `$0`（`income === 0` 時 fallback）— 這個對會計來說 OK（避免除零假數字），但沒 tooltip 說明「為什麼是破折號」
- [PASS] 空 seed 每張圖各自 render 空狀態圖示（灰圓餅 + 「本月尚無此類支出」/ Sankey「零金流可視化」）— 空狀態設計本身有做

**Persona 內心 OS**:
> 我進來就看到「本月總支出 $0」，一個做會計的看到大字 $0 只有兩個念頭：**要嘛系統壞了，要嘛我登錯帳號**。我甚至懷疑資料沒撈成功，因為我平常在 Excel PivotTable 空的時候不會有欄位標題全排好等我，只會空白。這裡什麼都有版型、但每格都零 — 這比純空白更讓我不安。
>
> 我原本想切「家庭公庫」看細節，但**帳戶篩選條根本沒出現**，我在 nav 跟頁首之間繞了兩圈找不到入口。之後才明白只有 1 個帳戶所以整條 hide 掉了 — 但我怎麼會知道？我以為我漏設定什麼。
>
> 頁面標題「分析報表」是好聽的名字，但 nav 寫「分析」、上方 pretitle 又是 `ANALYTICS`。我在 Word 報告會統一寫法的，這裡三種寫法我等一下要 refer 就會卡：老公問「你剛剛看到哪一頁的數字」我該說哪個？

**Anomalies**:

- **A1.1 [MEDIUM]** — 帳戶檢視範圍 strip 在只有 1 個帳戶時完全隱藏
  - Description: `AnalyticsView` gate 是 `accounts.length > 1`，但沒告訴使用者「隱藏」是刻意；新手完全看不到全域帳戶切換入口
  - Repro: 只留 1 個帳戶登入 → `/analytics` → 頁面頂部沒有帳戶切換
  - Suggested fix: `src/components/dashboard/analytics-view.tsx:210` — 保留 slim 條 disabled state，副標寫「目前僅 1 個帳戶」
- **A1.2 [LOW]** — nav / 頁面 title / pretitle 三處對這頁不同稱呼
  - Description: sidebar 「分析」 vs 頁面 h1「分析報表」 vs pretitle `ANALYTICS`
  - Suggested fix: `src/components/dashboard/navigation.tsx` + `src/app/(dashboard)/analytics/page.tsx` — 統一叫「分析報表」
- **A1.3 [LOW]** — 儲蓄率 `—` 沒有 tooltip 說明
  - Description: `income === 0` 走 fallback；會計懂但一般使用者不懂
  - Suggested fix: `src/components/dashboard/month-headline-cards.tsx:171` 附近加 tooltip「本月尚無收入，儲蓄率無法計算」

---

## UC2: 開「特定專案隔離模式」— 觀察歸檔區

**情境**: Emma 想把「太太醫療」跟「新居家電」這種一次性大額搬到歸檔區，讓月度圓餅只反映日常消費。

**步驟**:

1. 進 `/analytics`，捲頁找「🛡️ 特定專案隔離模式」slim 條
   ↳ Screenshot: `emma-uc2-step1-no-isolate-strip.png`
2. **整條完全沒渲染** — 因為這個帳號沒有任何 `project_tag` 資料，`hasTags = false` → return null
3. 走不下去

**觀察到的**:

- [MEDIUM] **隔離條完全消失，Emma 不知道這功能存在**。無 tag 帳號進來，完全找不到「原來還可以做這件事」的入口
- [BLOCKED] 語意方向、ON/OFF 對稱性、Collapsible 自動展開、歸檔區 line-through 樣式、主圖是否 spring reflow — **全部無法驗證**

**Persona 內心 OS**:
> 我聽說有個「特定專案隔離模式」，但我在 /analytics 上下滾了三圈都沒看到那條。我不確定是我登錯身份、還是這功能還沒 ship、還是被藏在某個「更多設定」下拉裡。
>
> 我理解可能是**你還沒打 tag 所以不顯示**——這對已經用一陣子的老手 OK，但對我這個第一次月底想試試看隔離功能的人，等於這個 feature 對我不存在。做會計的職業病：**我看不見的功能等於不存在**。至少該有個 empty state 說「先在明細幫 3 筆以上打 tag，之後這裡就會出現」。

**Anomalies**:

- **A2.1 [MEDIUM]** — 特定專案隔離模式在無 tag 時完全隱藏，沒有教學入口
  - Description: `hasTags = false` 時整個 `motion.div` block 直接 skip，使用者不知這功能存在
  - Repro: 開新帳號 or 沒打過 `project_tag` → `/analytics` → 找不到隔離模式
  - Suggested fix: `src/components/dashboard/analytics-view.tsx:286` — 改為即使 `hasTags=false` 也留一條「教學態」：icon 灰、switch disabled、副標「幫任一筆明細打上專案標籤即可啟用」+ link 到 /transactions

---

## UC3: 去 /transactions 搜「醫療」+ 日期區間

**情境**: Emma 想單獨看太太醫療相關的支出，先搜「醫療」看命中，再套「近 90 天」preset 縮到最近的觀察窗。

**步驟**:

1. 進 `/transactions`
   ↳ Screenshot: `emma-uc3-step1-landing.png`
2. 搜尋框輸入「醫療」
   ↳ Screenshot: `emma-uc3-step2-query-yi-liao.png`
   ↳ 命中 0 筆 → 顯示「找不到符合『醫療』的帳目」空狀態
3. 打開右側日期 Range Picker
   ↳ Screenshot: `emma-uc3-step3-date-picker-open.png`
4. 點「近 90 天」preset
   ↳ Screenshot: `emma-uc3-step4-preset-90d.png`
   ↳ trigger 上顯示「2026/04/05 ~ 2026/07/03」，空狀態文字更新為「找不到符合『「醫療」 · 2026-04-05 ~ 2026-07-03』的帳目」

**觀察到的**:

- [PASS] `近 90 天` preset click 後 trigger 文字馬上更新（`2026/04/05 ~ 2026/07/03`），空狀態文字也把日期區間帶入 — **有正確重算**
- [PASS] `搜尋疊整` 摘要區塊在 `results.length === 0` 時**不渲染**，改由「找不到符合」空狀態接手 — 這是正確 gate 設計（避免顯示「找到 0 筆，總共花費 $0」的雞肋摘要）
- [MEDIUM] **搜「醫療」全空**：0 筆命中，無法驗證「找到 N 筆 / 總共花費 $X」是否算對 — 也就是 UC3 主要要考核的**跨月搜尋加總 credibility** 完全沒驗到
- [MEDIUM] **日期 input 走美式 `mm/dd/yyyy` placeholder**，preset 按鈕卻是中文「本月 / 上月 / 近 30 天 / 近 90 天」。UI 語系分裂 — Emma 這種台灣家庭 CFO 看到 mm/dd 會先想 3 秒才確定「1/12 是 1 月 12 日還是 12 月 1 日」。實際上 `<input type="date">` 的 placeholder 是**瀏覽器 locale 決定**，不會被 spec 直接控 — 需要用 pattern input 或明確格式化
- [MEDIUM] 「搜尋疊整 hint」用 ISO `2026-04-05` 但 picker trigger 顯示 `2026/04/05` — 同一頁**兩種日期分隔符**（`-` vs `/`）
- [PASS] 空狀態訊息把 keyword + 日期都帶入（`找不到符合「醫療」 · 2026-04-05 ~ 2026-07-03 的帳目`）— 這對 Emma 有幫助，她一眼看出「這是有加日期過濾」而不是「單搜『醫療』還是 0」

**Persona 內心 OS**:
> 「找不到符合『醫療』的帳目」看到我就知道八成是資料還沒進來，不是搜尋壞了 — 這句話寫得夠誠實。但我馬上多疑：「是不是我打的『醫療』沒斷詞到？」我試著 `+` 串「醫療+看病+診所」，都是 0。這時我會**放下手回頭去 /transactions 首頁看有沒有 200 筆基本紀錄** — 沒有，一片空 — OK 那不是搜尋問題，是**這台系統對我這個帳號是空的**。
>
> 日期 picker 起始日期是 `mm/dd/yyyy` 我要停 2 秒轉譯，然後預設按鈕是中文「近 90 天」— **一半英一半中**很不舒服。而且我點下去 trigger 顯示 `2026/04/05`，可是「找不到符合」訊息裡是 `2026-04-05`。同一句話同一頁兩種日期寫法，會計腦看到會抓狂：**這是同一個日期嗎？還是 4/5 vs 4 月 5 日的 typo？**

**Anomalies**:

- **A3.1 [MEDIUM]** — `<input type="date">` placeholder 走瀏覽器 locale (mm/dd/yyyy)，preset 用中文，語系分裂
  - Description: `src/components/ui/date-range-picker.tsx:158` `type="date"` 未指定 `pattern` / `lang`；Chrome 預設 mm/dd 對台灣使用者違和
  - Suggested fix: 改用 text input + custom parser（吃 `2026-07-03` / `2026/7/3`），或加 `lang="zh-Hant"` 屬性
- **A3.2 [MEDIUM]** — trigger 顯示 `2026/04/05` vs 空狀態訊息 `2026-04-05`：同頁兩種日期分隔符
  - Description: `date-range-picker.tsx::fmt` 用 `/` 分隔，`transactions-view.tsx::summaryHint` 用原 ISO 字串直接串
  - Suggested fix: 統一走 `YYYY-MM-DD`（ISO）或 `YYYY/MM/DD`；集中在單一 formatter helper
- **A3.3 [MEDIUM]** — 空 seed 導致跨模組加總對帳驗證完全 no-op
  - Description: /analytics 本月支出 $0，/transactions 搜任何字都 0 命中；兩邊剛好相等，credibility 未真正驗證
  - Suggested fix: **提供一個 demo-data-loaded 帳號**（家庭公庫 + 隨身現金 + 至少 30 筆含「醫療」/「餐飲」/「太太醫療」tag 的紀錄）給 Emma 這種 persona 走完月底對帳 flow；或在 UAT 文件明確標「Emma 需 seed 帳號 X」

---

## UC4: 多選 3 筆 → 批次「更改分類」

**情境**: Emma 想批次把 UC3 找到的「醫療」相關明細改到「家庭醫療」分類。

**步驟**:

1. 進 `/transactions`
2. 搜「醫療」
   ↳ Screenshot: `emma-uc4-step1-search-yi-liao.png`
3. 想勾 3 筆 checkbox — 但列表區只顯示「找不到符合『醫療』的帳目」，沒有 row 可勾
   ↳ Screenshot: `emma-uc4-step2-not-enough-rows.png`
4. 卡住

**觀察到的**:

- [BLOCKED] 沒有任何 row 可選 → 無法驗證：
  - 底部 framer-motion 懸浮 bar 是否 spring 滑入
  - 「已選取 3 筆交易」是否正確計數
  - Popover Tabs `歸納專案 / 更改分類` 是否都在
  - 「更改分類」tab 分類 chip 是否含使用者自訂分類（尤其「家庭醫療」）
  - toast「已把 N 筆更改為【X】」是否顯示
  - 「M 筆非支出被略過」skip 提示是否誠實回報
- [PASS - 靜態程式碼閱讀] `src/components/dashboard/bulk-actions-bar.tsx:62` `buildCategoryChips` 邏輯正確：built-in 7 個 + 自訂 categories.filter(type=expense && !code)。跟 spec 對得起來
- [PASS - 靜態程式碼閱讀] `bulk-actions-bar.tsx:145` skipped 訊息 `（${result.skippedCount} 筆非支出被略過）` 有誠實回報

**Persona 內心 OS**:
> 我到這步就徹底停下來了。我沒有 row 可以勾，等於**這個 feature 對我來說完全隱形** — 我沒看過懸浮 bar 長什麼樣、沒點過「批次操作 ▾」、不知道 Popover 內是 Tabs 還是 chip flat。我讀 spec 知道它應該存在，但作為一個對系統要 build trust 的家庭 CFO，**沒親自看過的東西我不會拿去說「我用過了」**。
>
> 這個場景其實是 UAT 的核心 use case — 月底發現某幾筆分類打錯了要批次改。**如果 UAT 帳號連走一次這個都做不到，這輪驗收其實沒驗收到最重要的功能。**

**Anomalies**:

- **A4.1 [HIGH]** — 空 seed 帳號讓 UC4（月底批次改分類，UAT 核心用例）**完全無法走通**
  - Description: 沒有 row 就沒有 checkbox 就沒有懸浮 bar 就沒有 Popover 就沒有 toast — 整條驗證鏈斷在起點
  - Suggested fix: **提供標準 UAT seed 帳號**（見 A3.3），或提供一個「一鍵灌 demo 資料」按鈕（`src/components/dashboard/seed-demo-button.tsx` 已存在但沒在 walkthrough 起手處明顯提示）給空帳號使用者
- **[PASS check via code read]** — bulk skip 訊息從 `bulk-actions-bar.tsx:145` 看起來會誠實顯示；建議正式 seed 後再跑一次完整驗證

---

## Anomaly Summary Table

| ID | UC | Severity | Title | Suggested Fix |
|----|----|----------|-------|---------------|
| A1.1 | UC1 | MEDIUM | 帳戶檢視範圍 strip 只有 1 個帳戶時完全隱藏 | `src/components/dashboard/analytics-view.tsx:210` — 保留 disabled 教學態 |
| A1.2 | UC1 | LOW | nav「分析」/ h1「分析報表」/ pretitle `ANALYTICS` 三名對一頁 | `navigation.tsx` + `analytics/page.tsx` — 統一 |
| A1.3 | UC1 | LOW | 儲蓄率 `—` 沒有 tooltip 說明 | `month-headline-cards.tsx:171` 附近加 tooltip |
| A2.1 | UC2 | MEDIUM | 「特定專案隔離模式」無 tag 時完全隱藏，無教學入口 | `analytics-view.tsx:286` — 保留教學態 slim 條 |
| A3.1 | UC3 | MEDIUM | date input 走瀏覽器 locale（mm/dd/yyyy），preset 中文，語系分裂 | `date-range-picker.tsx:158` — 改 text input + parser 或明確 `lang` |
| A3.2 | UC3 | MEDIUM | trigger `2026/04/05` vs 空狀態 `2026-04-05` 同頁兩種日期分隔符 | 集中 formatter；建議走 ISO `YYYY-MM-DD` |
| A3.3 | UC3 | MEDIUM | 空 seed 讓跨模組加總 credibility 完全 no-op | 提供 UAT demo 帳號 or 在起始頁提示 seed-demo-button |
| A4.1 | UC4 | **HIGH** | 空 seed 帳號讓 UAT 核心用例「批次改分類」完全無法走通 | 同 A3.3 — 補 seed 是**驗收前置條件** |

---

## Cross-Module Integration Verdict

**/analytics ↔ /transactions**: **無法評估（灰燈）** — 兩邊都是 0，數字巧合對上等於零信號。這是**本次 walkthrough 最需要 flag 的 blocker**：

> **「Emma 月底對帳」這個 persona 的核心價值本來就是驗證兩頁對得起來** — /analytics 說本月支出 X 元 vs /transactions 搜同月加總 = X 元。今天 X = 0、X = 0 兩邊「對」了，但這個對其實什麼都沒證明。真正該問的問題：**如果 /analytics 說本月支出 $37,824 而 /transactions 搜「2026-07 全部」加總是 $37,801，那 $23 差在哪？**（轉帳兩腿、被隔離的 project_tag 交易、被歸檔的 wealth account、CSV 匯入尚未 dedup……都是可能來源。）
>
> 這個問題**這次沒被回答，因為沒資料**。強烈建議：orchestrator 補一個「seed-loaded 帳號」persona-walk，同一份 spec 跑一次，才能驗完 cross-module credibility。

**/analytics ↔ /net-worth** / 其他模組：**未走**（UC 沒設計到；建議下一輪 Emma 加）

**最危險的一句話**：*「Looks like data but doesn't add up」— 本次因為根本沒 data 所以無此風險，但也代表**本次沒排除此風險**。*

---

## Enhancement Backlog Candidates

### P1（high persona impact — 阻擋 UAT 驗收）

- **提供 UAT 標準 seed 帳號 or 顯眼的 seed-demo-button 入口** — 沒 seed 就走不完月底對帳 flow，等於這輪 UAT 沒驗到核心 use case（A3.3 / A4.1）
- **/analytics 空頁友善引導** — 全 $0 讓 Emma 質疑「是不是系統壞了」；建議加大 skeleton empty state「看起來是新帳號，先在明細加幾筆 / 或按下方灌入 demo 資料」（A1.1 延伸）
- **特定專案隔離模式教學態** — 讓沒 tag 的使用者也知道這 feature 存在（A2.1）

### P2（worth doing — 對帳日常摩擦）

- **date input locale 化 + 全站統一 ISO `YYYY-MM-DD`** — Emma 這種會計看到同頁兩種日期分隔符會扣分（A3.1 / A3.2）
- **統一頁面命名** —「分析」/「分析報表」/`ANALYTICS` 三選一（A1.2）
- **儲蓄率 `—` tooltip** — 一句話解釋為什麼是破折號（A1.3）

### P3（nice to have）

- 空狀態「找不到符合『醫療』」訊息目前很誠實 — 建議加一個 CTA「按此清除所有過濾看全部紀錄」
- 帳戶篩選 strip 副標「所有 N 個帳戶合計」— 建議在數字旁加小 badge 顯示 N 是幾（目前只有帶入字串）
- 月度大字 $0 時，加淡淡「本月尚未有帳目」水印取代空數字大字（避免看起來像故障）

---

## Notes for orchestrator

**這次 walk 的最大結論不是找到 bug，是揭示了一個 UAT gap**：

1. **測試帳號 `austin.hung@rfdme.com` 是空的** — 沒帳戶（只有 1 個 default 主要帳戶）、沒交易、沒 tag、沒自訂分類。這讓 4 個 UC 有 3 個核心驗證斷在起手（UC1 帳戶切換不能切、UC2 隔離條沒出現、UC3+UC4 搜「醫療」全空）
2. **軟體本身沒 CRITICAL bug 從這次 walk 看起來** — 空狀態設計都有做、preset 按鈕會 propagate 到訊息、UI gate 邏輯正確
3. **但「有沒有 CRITICAL bug」在這次 walk 沒被回答** — 尤其 cross-module 加總對帳 credibility 完全沒驗
4. **建議下一步**（優先序）：
   - **P0**：orchestrator 提供 seed-loaded 帳號 → 重跑同一份 spec（4 個 UC 應該才 fires all softChecks）
   - **P1**：把 A1.1 / A2.1 / A3.1 / A3.2 進 backlog；A1.2 / A1.3 順手修
   - **P2**：追加 Emma UC5「/net-worth 淨資產 vs /analytics 本月結餘同意」用例，補 cross-module 完整覆蓋
5. **spec 檔本身耐操度**：4/4 test pass、17 秒跑完、所有 softCheck 都不 abort。可以做 CI 常態跑（但空帳號版本會一直有 4 個 MEDIUM 假警報，等 seed 補上後值才會真變化）

**Anomaly 分佈細節**（給 aggregator 參考）：

- HIGH×1 全部屬於「seed 不足」類別，非 UI 本身 bug — 但仍列 HIGH 因為它 block 掉核心 UAT 用例
- MEDIUM×4 中，A1.1 / A2.1 是 UX（空狀態），A3.1 / A3.2 是 i18n / 日期一致性，A3.3 / A4.1 都指向 seed
- LOW×3 全部是 UI polish（命名 / tooltip）

**下一個 persona 建議**：如果下一位 persona 是 Ken（技術宅 / 資料忠實控），可以直接 stress-test /analytics 圓餅分類 vs 明細 groupBy — 但**同樣需要先 seed**。
