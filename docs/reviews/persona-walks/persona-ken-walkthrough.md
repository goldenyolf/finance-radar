# Ken 老王 Persona Walkthrough Report

**Date**: 2026-07-03
**Reviewer**: Persona Ken 老王（45 歲家庭主計 / 竹科 IT 白領）
**Environment**: frontend + backend 皆 http://localhost:3000（Next 16 Turbopack dev server）
**Tool**: Playwright CLI 1.61.1（headless, viewport 1920x1080 — 於 spec `test.use({...})` 內 pin 死）
**Login**: austin.hung@rfdme.com（密碼走 `PERSONA_TEST_PW` 環境變數，不再寫進 repo）
**Run cmd**: `PERSONA_TEST_PW='<pw>' npx playwright test e2e/walkthrough/ken-persona.spec.ts --workers 1 --reporter list`
**Spec**: `/Users/hungkuoxin/finance-radar/finance-radar/e2e/walkthrough/ken-persona.spec.ts`
**Screenshots**: 21 張，位於 `e2e/walkthrough/screenshots/ken-uc{N}-step{M}.png`

---

## Executive Verdict

- **能否日常使用**: ⚠（走得通，但四場戲每場都碰到 1 個以上會慢慢磨掉信任的問題）
- **迷路次數**: 2
  - UC1 掃首頁時找不到「本月現金流」單一大字，得逐板塊掃再心算加總
  - UC4 儲存專案標籤後看列表以為沒生效（其實有存到 DB，但列表不 render）
- **總 anomalies**: 5（CRITICAL=0 / HIGH=5 / MEDIUM=0 / LOW=0）
- **跨模組可追溯性**: 部分 —「快速記帳」寫入 → /transactions 讀取確實一致，但**分類自動判斷完全沒接**，跟 LINE bot 的體驗嚴重分裂。
- **測試通過率**: 4/4 tests pass（softChecks 分別收 anomaly，不 abort）

## 一句話 verdict

> App 底層寫入資料是正常的，UI 幾個節骨眼卻讓人不放心：桌面版記帳分類全掉「其他」、貼上專案標籤看不到、首頁沒有一目了然的 KPI。Ken 會繼續用，但邊用邊嘀咕。

---

## UC1: 早上 8:00 掃戰情室 — 3 秒內判斷本月健康度

**情境**: 老王起床拿手機打開 Money Radar 網頁版，想要 3 秒掃完就知道「本月還剩多少活錢」、「有沒有紅字警告」、「今天要注意什麼」。

**步驟**:
1. 已登入狀態直接進入 `/`
   ↳ Screenshot: `ken-uc1-step1.png`（Suspense skeleton 中）
2. 等 dashboard hydrate 完成 → 看到 header「👋 歡迎回來，喔耶！！」+ 3 個板塊卡
   ↳ Screenshot: `ken-uc1-step2.png`
3. 掃描：找不到單一 hero KPI（本月總支出/總收入/結餘），只有「家庭 / 個人 / 夢想」3 個板塊各顯示 $0
   ↳ Screenshot: `ken-uc1-step3.png`
4. 快速記帳 pill 找到（右上角 `👋 歡迎回來，喔耶！！` 附近）
   ↳ Screenshot: `ken-uc1-step4.png`

**觀察到的**:
- [PASS] 首頁能 3 秒內看到「歡迎回來」header + 板塊卡片 render 出來（skeleton → 真內容轉換 < 3s，符合期望）
- [PASS] 「快速記帳」入口按鈕在首頁 hero 區，一眼可見
- [HIGH] 首頁沒有「本月現金流健康度」單一大字 KPI — 版面是 3 個板塊卡（家庭/個人/夢想）各顯示本月預算 vs 實際，Ken 得逐板塊掃再心算加總才知道「整體」還剩多少活錢
- [OBSERVATION] 帳號本月 3 個板塊都是 $0 — 這帳號幾乎沒資料，不是產品 bug，但也讓 UC1 掃描體驗變成「掃過去一片 $0」

**Persona 內心 OS**:
> 嗯，看到「歡迎回來，喔耶！！」我這個蛤？「喔耶」是誰？我暱稱設的是「喔耶！！」？算了。
>
> 底下三個板塊：家庭 $0、個人 $0、夢想 $0。這是「我這個月都沒花錢」還是「還沒開始記」？我盯著看 5 秒才想到，喔對，這是預算欄位，我還沒建預算。
>
> 那我還是要問我最想知道的那句話 —「這個月我到底剩多少活錢？」竟然要點進其中一個板塊才知道。手機 Salesforce 那個 dashboard 都給我一顆大數字，Money Radar 這叫我自己心算三個 $0 相加嗎？

**Anomalies**:
- **A1.1 [HIGH]** — 首頁缺單一「本月現金流」hero KPI
  - Description: Ken 早上 8:00 掃首頁沒有一眼可見的「本月剩多少 / 淨流入 / 儲蓄率」大字，只有 3 個板塊各自的預算/實際。若板塊都 $0 或還沒設，這個資訊架構讓「戰情室」名不符實。
  - Repro: 打開 `/`（登入後），觀察 header 下方第一個 section。
  - Suggested fix: 在 header 下、板塊區之上插入一個 `MonthHeadlineCards`（此元件已存在於 `src/components/dashboard/month-headline-cards.tsx`，目前僅在 analytics 使用）；或做一個「本月總覽 pill」把 3 板塊加總顯示。`src/app/(dashboard)/page.tsx:176`（header 結束處）為插入點。

---

## UC2: 中午 12:30 用 FAB 記一筆 60 元早餐（現金）

**情境**: 老王剛買了 60 元早餐用現金付。他要用右上「快速記帳」按鈕記下來，全程要少於 15 秒。

**步驟**:
1. 進到 `/` 首頁準備開 dialog
   ↳ Screenshot: `ken-uc2-step1.png`
2. 點右上「快速記帳」pill → dialog 打開
   ↳ Screenshot: `ken-uc2-step2.png`
3. 「支出」tab 預設 selected（PASS）；打「早餐」進「項目名稱」欄位、金額 60
   ↳ Screenshot: `ken-uc2-step3.png`
4. 觀察付款方式「現金」pill — **並未預設 active**，得手動點一下才 highlight
   ↳ Screenshot: `ken-uc2-step4.png`
5. 扣款帳戶欄位自動變成「隨身現金」— 帳戶自動綁定 OK
   ↳ Screenshot: `ken-uc2-step5.png`
6. 點「新增交易」→ toast「已新增交易 支出 早餐 ・ NT$ 60」瞬間出現
   ↳ Screenshot: `ken-uc2-step6.png`
7. Dialog 關閉，回到首頁
   ↳ Screenshot: `ken-uc2-step7.png`

**觀察到的**:
- [PASS] 「快速記帳」入口 pill 位於 header 右側，一眼可見
- [PASS] Dialog 開啟後「支出」tab 預設 aria-selected=true，不用切
- [PASS] 打「早餐」金額 60，5 秒內填完
- [PASS] 選現金 pill 後扣款帳戶自動綁「隨身現金」— account_type ↔ payment_method 雙向繫結有效
- [PASS] 送出後成功 toast「已新增交易 支出 早餐・NT$ 60」出現，DIALOG 隨後關閉
- [MEDIUM] 「現金」pill 不預設 active（除非第一個帳戶 type=cash）— Ken 需多點一下。此 dev 帳號第一個帳戶不是 cash，所以看到 pill 是灰色。
- [POTENTIAL HIGH — 隱藏成本] 快速記帳 dialog **沒對「早餐」做分類自動判斷**（driver：`src/lib/actions/transactions.ts:583` `const category = input.type === "income" ? null : (input.category ?? "other")`）；使用者不主動選分類就一律進「其他」。此問題的爆炸點在 UC3 才被觀察到。

**Persona 內心 OS**:
> Dialog 一秒彈出來，「支出」tab 綠色... 呃紅色 active，OK 對，早餐是支出。
>
> 「項目名稱」打「早餐」，金額打 60。付款方式呢？「現金」pill 是灰的、要點一下才 highlight。奇怪，我開這個 dialog 上一秒還沒選任何東西，它是憑什麼幫我預設「刷卡」？等一下 — 現金那個 pill 也是灰灰，那我到底目前綁誰？扣款帳戶 select 看一眼寫「隨身現金」啊，那還好我就順著點「現金」pill。點下去，pill 變黑、扣款帳戶還是「隨身現金」。哦這個帳戶跟付款方式是綁在一起的，那更奇怪 — 你都幫我綁到「隨身現金」了，付款方式那排為什麼不同步 highlight「現金」？
>
> 算了不糾結，點「新增交易」。「已新增交易 支出 早餐 NT$ 60」— 很好，toast 出現，dialog 關掉。整段 12 秒，符合我的目標。
>
> （唯一心裡碎念：我沒選分類，這筆會被算成什麼？之後看明細再說。）

**Anomalies**:
- **A2.1 [MEDIUM]** — 現金 pill 不隨扣款帳戶預設值同步 highlight
  - Description: dialog 開啟時扣款帳戶已預設「隨身現金」，但「現金」pill 呈灰色未 active；使用者得手動再點一次 pill 才視覺 highlight。從 handler 看，`initialPaymentMethod()` 有依 accounts[0].type 算，但可能第一個帳戶不是 cash type，導致 pill 跟 select 對不上第一筆時的視覺。
  - Repro: 進首頁 → 點快速記帳 → 觀察付款方式列跟扣款帳戶欄位。
  - Suggested fix: `src/components/dashboard/quick-add-transaction.tsx:99` `initialPaymentMethod()` 依「第一個 cash type 帳戶存在則預設 cash」而非「第一個 accounts」；或反向：`initialPaymentMethod` 就依 `accounts[0]?.type` 出來的 payment 走，並讓 dev 帳號的第一個 account 落在 cash 上時預設 cash pill。

---

## UC3: 下班 18:00 走 /transactions 查剛剛那筆早餐

**情境**: 老王想確認 UC2 那筆有沒有存好。走 nav 進「歷史明細」，搜「早餐」，看列表。

**步驟**:
1. 點左側 sidebar「明細」→ `/transactions`
   ↳ Screenshot: `ken-uc3-step1.png`
2. 搜尋框打「早餐」→ 等 debounce 完 → 出現 2 筆結果（測試連跑兩輪各 1 筆）
   ↳ Screenshot: `ken-uc3-step2.png`
3. 定位今天日期那筆：`2026/07/03 早餐 其他 隨身現金 −$60`
   ↳ Screenshot: `ken-uc3-step3.png`
4. 觀察：分類 badge 顯示「其他」（灰色），不是預期的「餐飲食品」（橘）；現金 badge 正確
   ↳ Screenshot: `ken-uc3-step4.png`

**觀察到的**:
- [PASS] 「明細」nav 一點即到，`/transactions` 頁面搜尋框秒 render
- [PASS] 搜「早餐」找得到那筆（confirm UC2 寫入持久化）
- [PASS] 「隨身現金」帳戶名 + 現金 payment_method badge（`aria-label="現金"`）在該列右側都對得上
- [HIGH] 分類 = 「其他」（灰色 dot），期望是「餐飲食品」（橘色 dot）— UC2 的「早餐」項目名稱應由前端 quick-add 或 server action 走 `classifyByKeyword` 匹配到 `food_dining`，但這條路沒接上

**Persona 內心 OS**:
> 「明細」點下去，秒開。搜尋框打「早餐」，跑了兩秒，找到 2 筆 —— 兩筆都是今天 $60，OK 那應該就是我剛才記的（測試連跑，我不介意）。
>
> 但是等一下，分類是「其他」？「早餐」這麼直覺的中文詞、跟你們家 LINE bot 都能自動辨識的關鍵字，桌面版打字記帳的時候居然不會自動歸類？我每天記 30 筆早餐、午餐、便當、飲料，全部落「其他」，那我 /analytics 看分類 pie chart 就一片灰色「其他」佔 90%。分類做這個系統幹嘛？
>
> 現金 icon 是有出現在右邊，$60 也對，$60 我看到滿意的。分類的事情我可以之後再一筆一筆用「更改分類」批次修，但我不記得月底之前會有耐心做這件事。

**Anomalies**:
- **A3.1 [HIGH]** — 桌面版快速記帳未做關鍵字自動分類，分類統一落「其他」
  - Description: quick-add dialog 未把使用者輸入的「項目名稱」拿去 `classifyByKeyword()` 匹配；`createTransaction` 收到 undefined category 一律填 'other'（`src/lib/actions/transactions.ts:583`）。LINE bot 用 Gemini 有做分類，但桌面版直接 skip，導致同一個「早餐」LINE 進來會落 food_dining、網頁記帳落 other，跨入口體驗嚴重不一致。
  - Repro: 打開快速記帳 → 項目名稱「早餐」→ 金額 60 → 不手動選分類 → 送出 → 到 `/transactions` 查該筆，分類 badge 顯示「其他」。
  - Suggested fix: 兩個做法擇一 —
    (a) 前端在 quick-add-transaction 送出前先跑 `classifyByKeyword(description)` 決定 category（詳見 `src/lib/expense-categories.ts:132` 該表已含 `food_dining: ["早餐", ...]`）
    (b) 後端 `createTransaction` 在 category 為 undefined 且 type=expense 時 fallback `classifyByKeyword(input.description)` 而不是硬填 'other'（`src/lib/actions/transactions.ts:583`）
    後者更集中，且能自動涵蓋將來的其他寫入入口。

---

## UC4: 晚上 21:00 幫剛才那筆加專案標籤「太太醫療」

**情境**: 老王想給那筆早餐貼「太太醫療」專案標籤（雖然早餐不太可能真是「太太醫療」— 這是流程演練）。

**步驟**:
1. `/transactions` 頁面搜「早餐」→ 兩筆結果
   ↳ Screenshot: `ken-uc4-step1.png`
2. hover 第一筆讓 pencil icon 浮現
   ↳ Screenshot: `ken-uc4-step2.png`
3. 點鉛筆 → 「編輯帳目」dialog 打開
   ↳ Screenshot: `ken-uc4-step3.png`
4. 拉到底找「歸屬專案標籤」欄位（datalist 有 1 個建議 = 之前留下的 tag），打「太太醫療」
   ↳ Screenshot: `ken-uc4-step4.png`
5. 點「儲存」→ dialog 關閉、toast「已更新帳目 早餐・NT$ 60」浮出
   ↳ Screenshot: `ken-uc4-step5.png`
6. 觀察列表這筆：內容是「2026/07/03 早餐 其他 隨身現金 −$60」— **沒有「太太醫療」的視覺蹤跡**
   ↳ Screenshot: `ken-uc4-step6.png`

**觀察到的**:
- [PASS] 編輯 icon 靠 md:group-hover 浮現機制在桌面 hover 時正確露出（aria-label = "編輯 早餐"）
- [PASS] 編輯 dialog 打開快、resource 對得上正確那筆
- [PASS] 「歸屬專案標籤」欄位可見、datalist 有既有 tag 建議（本次跑到 1 個建議 — 是前次跑遺留的 tag）
- [PASS] 儲存後 DB 有更新（toast「已更新帳目」+ dialog 關閉）
- [HIGH] 儲存成功但 **/transactions row 完全沒 render project_tag** — 使用者從外觀無法確認貼上成功；得再打開 edit dialog 才知道有沒有存進去
- [HIGH] 沒 project_tag row visual = 「/analytics 專案歸檔」跟「/transactions」看的是兩個世界；家庭主計最想在明細頁一眼掃「太太醫療」花了哪幾筆，做不到

**Persona 內心 OS**:
> 找到那筆早餐，hover 一下，右邊就浮出鉛筆跟垃圾桶 icon。點鉛筆。
>
> Dialog 開了，「編輯帳目」— 標題乾淨。往下拉，過了項目、金額、帳戶、花費類型...嗯還可以順便把分類改一下但等下再說。找到「🏷️ 歸屬專案標籤」，label 有 emoji 蠻可愛。打「太太醫療」— datalist 有跳「太太醫療」的自動完成，看起來我上次就已經打過（測試跑第二次）。點儲存。
>
> Toast 出來「已更新帳目 早餐 NT$ 60」— 有存到。
>
> 我看列表這筆... 咦？還是「早餐、其他、隨身現金、−$60」，「太太醫療」呢？我剛剛不是儲存了？
>
> 再點鉛筆確認 — 對啊 dialog 打開 project_tag 欄位裡面確實躺著「太太醫療」四個字。
>
> 那你們這個列表視覺為什麼不顯示？我打「太太醫療」是希望以後在明細頁一眼看到「哦這筆屬於老婆看醫生」啊，現在我點三下才能確認一筆的 tag，那我幹嘛貼？我還不如打去項目名稱裡面「太太醫療-早餐」自己做前綴，至少列表看得到。這個功能等於做半套。

**Anomalies**:
- **A4.1 [HIGH]** — 交易列不 render project_tag
  - Description: `TransactionRow` (`src/components/dashboard/transactions-view.tsx:706-728`) 只 render 日期、description、category badge、account 名稱、金額、payment method badge — 完全跳過 `row.project_tag`。使用者從列表視覺無法確認是否有 tag、也無法掃描「太太醫療 有哪些筆」。
  - Repro: 編輯任一筆貼上專案標籤 → 儲存 → 回列表這筆完全跟其他沒 tag 的看起來一模一樣。
  - Suggested fix: 在 `src/components/dashboard/transactions-view.tsx:714-727` 分類 badge 那個 `<p>` 內附加 `{row.project_tag && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 ring-1 ring-amber-500/20">🏷️ {row.project_tag}</span>}`，跟分類 badge 並列。

- **A4.2 [MEDIUM — 上面 A4.1 的併發症]** — 儲存 toast「已更新帳目」內容不含變更摘要
  - Description: toast 只顯示「早餐・NT$ 60」，看不出這次改的是專案標籤、分類還是金額。使用者對「這次真的存到 tag 了嗎」失去確認感。
  - Repro: 編輯任一筆只改 project_tag 存檔，觀察 toast。
  - Suggested fix: `src/components/dashboard/transaction-row-actions.tsx` handleSubmit 的 toast.success 加上 diff 摘要，例如「已標記為『太太醫療』」。

---

## Anomaly Summary Table

| ID | UC | Severity | Title | Suggested Fix (file:line) |
|----|----|----------|-------|---------------------------|
| A1.1 | UC1 | HIGH | 首頁缺單一「本月現金流」hero KPI | `src/app/(dashboard)/page.tsx:176`（header 後插入 MonthHeadlineCards 或加總 pill） |
| A2.1 | UC2 | MEDIUM | 現金 pill 不隨扣款帳戶預設值同步 highlight | `src/components/dashboard/quick-add-transaction.tsx:99` (`initialPaymentMethod`) |
| A3.1 | UC3 | HIGH | 桌面版快速記帳未做關鍵字自動分類，分類統一落「其他」 | `src/lib/actions/transactions.ts:583`（或 `quick-add-transaction.tsx:213` 送出前先 classify） |
| A4.1 | UC4 | HIGH | 交易列不 render project_tag，貼標籤看不到效果 | `src/components/dashboard/transactions-view.tsx:714-727`（分類 badge 旁加 tag chip） |
| A4.2 | UC4 | MEDIUM | 儲存 toast 不含 diff 摘要，使用者對「這次改到什麼」無感 | `src/components/dashboard/transaction-row-actions.tsx` handleSubmit toast |

（UC1 板塊都 $0 的觀察屬於 dev 帳號 state issue，不列表。）

## Cross-Module Integration Verdict

- **快速記帳寫入 ↔ /transactions 讀取**: 綠燈 — 送出後即時反映（透過 router.refresh + revalidatePath）
- **快速記帳分類 ↔ 分類系統**: **紅燈** — 桌面版直接繞過關鍵字分類，跟 LINE bot 走 Gemini 分類的世界脫節；使用者從兩個入口寫入的資料在 /analytics 看到的分佈會嚴重扭曲
- **編輯 project_tag ↔ /transactions 列表**: **紅燈** — DB 有存但列表視覺零 render；只有 /analytics 專案歸檔頁看得到（是 project_tag 為主的另一個 view），主明細頁完全沉默
- **編輯 project_tag ↔ /analytics 專案歸檔**: 未測（本次 walk 只走 /transactions）— 但根據 CLAUDE.md 描述應該綠燈

**最危險的發現**: 分類「其他」化 + 專案標籤不可見 兩個問題連起來的影響 —— Ken 用桌面版記 30 筆／月，全部落「其他」+ 貼過的 tag 主明細看不到，結果家庭主計最想要的兩個切維度（分類 pie / 專案 archive）都會失真到無法信任。

## Enhancement Backlog Candidates

### P1（家庭主計高影響）
- **A4.1** 交易列渲染 project_tag chip — 貼標籤變得有意義。
- **A3.1** 桌面版快速記帳自動分類 —「早餐」→ 餐飲食品要在寫入時決定，不能靠使用者事後修。
- **A1.1** 首頁加「本月現金流健康度」單一 hero KPI — 直接讓「戰情室」名副其實。

### P2（值得做）
- **A2.1** dialog 開啟時付款方式 pill 跟扣款帳戶預設值視覺同步。
- **A4.2** 編輯 toast 加 diff 摘要。
- （新）搜尋框加 loading skeleton row：目前 debounce 中列表空掉，Ken 以為 0 筆結果會焦慮。

### P3（優化）
- Header「👋 歡迎回來，喔耶！！」中的 display_name = "喔耶！！" 看起來像測試資料；如果生產狀態出現 emoji-only 或超短 name，建議加最短長度提示。
- 板塊卡片 `$0` 態加「還沒設本月預算 → 到設定」的引導 CTA，避免掃描時一片 $0 的困惑。

## Notes for orchestrator

- **DB 狀態說明**：這次 walk 跑第二次時 UC2 又寫了一筆「早餐 $60」，DB 現在有 **2 筆重複** 的 `2026/07/03 早餐 $60`（隨身現金、其他分類、太太醫療 tag 其中一筆已貼上、另一筆未貼）。是否清掉請 orchestrator 依需要決定。相關 SQL 大致：`delete from transactions where description = '早餐' and date = '2026-07-03' and user_id = <austin_uid>;`
- **本 dev 帳號的「三個板塊本月都 $0」是 state 問題不是 UI bug** — 但因為 Ken 是家庭主計人設，我把 UC1 掃描的困惑保留為 HIGH（Ken 對「戰情室」有明確期待）。若下一個 persona 是新用戶，這個 finding 可能會被重新分類為 MEDIUM。
- **前端 hero header 顯示的暱稱是「喔耶！！」** — 從 profile.display_name 讀來，非產品 bug，但 orchestrator 若做展示畫面錄影時建議先改回較合理的暱稱。
- **未走：LINE bot 記帳 / 語音記帳 / 手機 FAB 版**。行動版 FAB 是「記帳」pill（`quick-add-transaction.tsx:277`），走的是同一個 dialog，桌面版驗過的 UX finding 大致可以繼承；LINE bot 分類有 Gemini 兜底，跟桌面版差很多，值得再開 persona 走一次。
- **無 CRITICAL 但有 5 個 HIGH**：Ken 這個 persona 的天花板是「值得每天用」；5 個 HIGH 全都戳中「值得日常使用」這個判準（分類 / 標籤可見 / 首頁掃描性），建議 P1 fix 一輪後再邀請下一個 persona review。
