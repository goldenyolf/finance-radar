# Persona Walk Fix Plan · Round 1

Source findings：`persona-ken-walkthrough.md` (5 HIGH / 0 MEDIUM / 0 LOW) + `persona-emma-walkthrough.md` (1 HIGH / 4 MEDIUM / 3 LOW)。
Goal：把 5 HIGH + 3 MEDIUM 修完，讓下一輪 persona walk 從 ⚠ 升 ✓。

---

## Wave A — UX critical（Ken 面向）

### K-A3.1 · Quick Add 補 classifyByKeyword fallback

**Symptom**：網頁 Quick Add 存「早餐 60」→ /transactions 顯示分類為「其他」，非「餐飲食品」。LINE bot 走 Gemini 有 classify，網頁沒接。跨入口世界脫節。

**Root cause**：`createTransaction` server action 只把 caller 傳的 `input.category` 寫入；沒傳就 default `"other"`（見 `src/lib/actions/transactions.ts` insert 那段）。Quick Add UI 沒 caller 側 classify，全部落 other。

**Fix**：`createTransaction` 在 insert 前，若 `type === "expense"` 且 caller 沒傳 category，走 `classifyByKeyword(input.description)` 補分類 — 「早餐」→ food_dining。若 keyword classifier 也沒命中回 `"other"`（保底同原行為）。

**File**：`src/lib/actions/transactions.ts`（新 import from `@/lib/expense-categories`）

**Verify**：跑 Ken UC3 → 早餐分類 = 餐飲食品

---

### K-A4.1 · TransactionRow render project_tag chip

**Symptom**：貼「太太醫療」tag → save → 明細列完全沒視覺變化，需再開 edit dialog 才知道有沒有存到。

**Root cause**：`transactions-view.tsx` 的 `TransactionRow` 只 render category chip + account name；`row.project_tag` 完全未渲染。

**Fix**：在 account name 旁加 tag chip（跟 category chip 同樣式，但 muted 底 + `🏷️` prefix），只在 `row.project_tag` 有值時 render。

**File**：`src/components/dashboard/transactions-view.tsx` — `TransactionRow` function

**Verify**：跑 Ken UC4 → tag 存完自動出現在列上

---

### K-A1.1 · 首頁掛 MonthHeadlineCards hero

**Symptom**：Ken 早上 8:00 掃戰情室要「3 秒判斷本月現金流健康度」；首頁只有 3 個板塊卡，需逐塊看再心算加總，達不到目標。

**Root cause**：首頁 `app/(dashboard)/page.tsx` 沒統合 KPI；`MonthHeadlineCards`（本月支出 / 收入 / 儲蓄率）已存在但只在 `/analytics` 用。

**Fix**：把 `MonthHeadlineCards` import 到首頁，放在 header 下方、板塊 grid 上方。傳 `transactions` + `monthDate=new Date()` 即可。

**File**：`src/app/(dashboard)/page.tsx`

**Verify**：跑 Ken UC1 → 進首頁看到 3 個大字 KPI（支出/收入/儲蓄率）

---

## Wave B — MEDIUM polish（Ken + Emma）

### K-A2.1 · Payment pill 初始 highlight sync

**Symptom**：Quick Add 開啟時預設扣款帳戶 = 「隨身現金」但「現金」pill 是灰色，得手動點一次才 highlight。

**Root cause**：`quick-add-transaction.tsx` 初始 `useState<PaymentMethod>("cash")` — hardcoded 沒看第一個 account 的 type。若第一個 account 是 credit_card / bank，反而是 credit_card / transfer 才對。

**Fix**：初始值改成從 `accounts[0]?.type` 推：`{ cash: "cash", credit_card: "credit_card", bank: "transfer" }[accounts[0]?.type ?? "cash"]`。

**File**：`src/components/dashboard/quick-add-transaction.tsx`

**Verify**：帳戶預設是現金 → dialog 開啟時「現金」pill 已 highlight

---

### E-A3.1/2 · Date picker locale 一致化

**Symptom**：
- input `type="date"` placeholder = `mm/dd/yyyy`（browser locale，Emma 看到英文）
- Preset 按鈕文字 = 中文「近 90 天」
- Trigger 顯示日期用 `2026/04/05`（`/` 分隔）
- 空狀態訊息 / summary 顯示 `2026-04-05`（`-` 分隔）— 同頁兩種

**Root cause**：`date-range-picker.tsx` 內幾處 formatter 不一致；summary 直接把 ISO 塞出來。

**Fix**：統一 formatter — 所有 user-facing 顯示走 `YYYY/MM/DD`。DB 存 / component state 仍用 ISO `-`（跟 Supabase `date` 欄位對齊）。抽個 `formatDisplay(iso)` helper。

**File**：`src/components/ui/date-range-picker.tsx`（+ 檢查 `transactions-view.tsx` summary 是否用同一個）

**Verify**：全頁面所有 date 顯示都 `/` 分隔

---

### E-A1/2.1 · Analytics slim strip 教學態

**Symptom**：`accounts.length <= 1` 時帳戶篩選 strip 完全 `return null`；`hasTags = false` 時專案隔離 strip 也完全 `return null`。新手看不到這些功能存在。

**Root cause**：`analytics-view.tsx` 的 conditional render 是硬 skip；沒 disabled 教學態。

**Fix**：改成 disabled 灰色 strip + 教學文字：
- 帳戶 strip：`accounts.length <= 1` → 顯示灰色「新增第二個帳戶後可切換檢視範圍」
- 隔離 strip：`hasTags = false` → 顯示灰色「幫某筆交易打上專案標籤後可啟用」

Icon 保留（暗淡）、Switch/Select 走 disabled，副標一句話帶引導。

**File**：`src/components/dashboard/analytics-view.tsx`

**Verify**：空 seed 帳號進 /analytics 應該還能看到兩條 strip 的存在（灰色 + 教學文）

---

## 不在本輪修法

| # | Item | 原因 |
|---|---|---|
| E-A4.1 | UAT 帳號空、無 seed | infra 問題不是 code bug；下輪 persona walk 前手動跑 seed（`/settings` → NEXT_PUBLIC_ENABLE_DEMO_SEED=true 才有按鈕） |
| K-A4.2 | Toast 加 diff 摘要 | 需要在 client 側算 diff，中等複雜度；本輪先不動，若下輪 Ken 仍反映再修 |
| Ken 產生的 test rows | 2 筆 [DEMO] 早餐 $60 | 手動 SQL `DELETE FROM transactions WHERE description = '早餐' AND date = '2026-07-03';` |
| profile.display_name「喔耶！！」 | user 自己的資料 | 錄 demo 前 user 到 /settings 改 |

---

## 執行順序

1. K-A3.1（action 層，最有 leverage）
2. K-A4.1（列表 render，unblock user 驗證 tag 是否存到）
3. K-A1.1（首頁 hero，Ken UC1 立即改善）
4. K-A2.1（payment pill sync）
5. E-A3.1/2（date locale）
6. E-A1/2.1（analytics 教學態）
7. `tsc --noEmit` + `eslint` 全綠燈
8. 手動打開瀏覽器 sanity check 一遍
9. 提示 user 準備下一輪 persona walk

---

## Verification path

- Ken 4 UC 重跑：期待 HIGH 從 5 → 0-1
- Emma 4 UC 重跑（先跑 demo seed）：期待完成 cross-module credibility 檢驗（同月支出 pie = 明細加總）
- 兩位合議 verdict 期待從 ⚠ → ✓
