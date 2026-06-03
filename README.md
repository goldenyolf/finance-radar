<div align="center">

# 💸 Money Radar

### **個人財務戰情室** — 從巨觀到微觀的決策級理財儀表板

把記帳、預算、儲蓄率、資產淨值、LINE 多模態 AI 一次整合在同一個 Apple 風的指揮室。

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Cron%20%2B%20Edge-000000?logo=vercel&logoColor=white)](https://vercel.com/)

</div>

---

## ✨ Why Money Radar?

> **記帳 App 多到爛。但能同時做到「LINE 一句話完成記帳 → 自動跑 6 個維度分析 → 給出健康度建議 → demo 還能一鍵糊掉金額」的，這是第一款。**

市面上的個人理財工具大概落在兩個極端：

| 類別 | 代表 | 痛點 |
|---|---|---|
| **記帳 App** | 簡單記帳、CWMoney | 只記，不分析。資料死在資料庫裡。 |
| **企業財務 BI** | Notion、Google Sheet | 需要每月手動整理、無 AI 入帳、零自動化警報。 |

**Money Radar 想做的是「一個人的 BI 戰情室」** — 記帳 0 摩擦（LINE 一句話）、分析自動化（6 種面向）、決策即時可見（tier 染色 + 智囊建議）。

---

## 🎯 核心功能總覽

### 💬 LINE 多模態 AI 記帳

```
你：午餐 120
🤖：✅ 已成功記帳：[食物] 午餐 $120（個人主帳戶）

你：領到補助 3000
🤖：💰 已記錄收入：領到補助 +$3000（個人主帳戶）

你：🎙️ [語音訊息]「晚餐去吃了麥當勞花了一百五」
🤖：🎙️ 語音辨識成功：「晚餐去吃了麥當勞花了一百五」
     ✅ 已成功記帳：[食物] 晚餐去吃了麥當勞 $150

你：📷 [發票照片]
🤖：📷 辨識到 5 筆消費並批次寫入資料庫
```

| 通道 | 技術 | 用途 |
|---|---|---|
| 文字 | 關鍵字優先 + **Gemini JSON 抽取** | 一次拿 `{item, amount, account_override, category, payment_method}` 五欄；regex 是 fallback |
| **語音** | **OpenAI Whisper STT** | 「晚餐花了一百五」→ 自動辨識 + 記帳 |
| **發票圖片** | **GPT-4o Vision** | 一張發票辨識多筆 item，批次寫入 |
| 收入意圖偵測 | 26 個中文關鍵字（領到/收到/補助/獎金⋯）| 零成本判斷 type，不耗 LLM token |
| **付款方式判定** | LLM 6 階決策樹 | 關鍵字（刷/卡/轉/匯）→ 高額固定支出（房貸/房租/學費）→ 帳戶 type 暗示 → 預設 cash |

#### 🪜 帳戶歸屬 fallback chain（7 階智慧路由）

LLM prompt 動態注入使用者所有 `accounts`（含 `type` 提示）+ `categories` 作上下文，一次抽出 `{account_override, payment_method, category}` 三層線索，走 7 階 fallback — 任何一層中就停：

```
1. LLM account_override         (使用者明示：「晚餐 120 台新」→ acc-taishin)
   ↓ 不命中
2. paymentMethod=cash           → 第一個 type='cash' 帳戶（per 0012 trigger 保證每個 user 都有現金錢包）
   ↓ 不命中
3. paymentMethod=credit_card    → 第一個 type='credit_card' 帳戶
   ↓ 不命中
4. categories.default_account_id (e.g.「水電」分類綁台新)
   ↓ 不命中
5. profiles.default_account_id   (帳號層 singleton 主帳戶)
   ↓ 不命中
6. accounts id 字典序第一筆      (code-side 保底)
```

> 💡 LLM 自己判 `payment_method` 後，「現金消費走現金錢包、刷卡走信用卡帳戶」變成 zero-config 自動行為。輸入「吃午餐 100」→ 自動 cash + 現金錢包；輸入「繳房貸 25000」→ 自動 transfer + 銀行帳戶；輸入「刷卡買鞋 1980」→ 自動 credit_card + 信用卡帳戶。LINE 回覆會帶 `💵 / 💳 / 🏦` emoji 讓使用者立刻看見大腦判斷。

---

### 🏠 動態財務板塊（戰情室）

**不再是寫死的「家庭/補助/個人」三大塊** — 完全 data-driven，使用者自由增刪改。

- 📋 PG 後台 `dashboard_plates` 表 + 4 條 RLS policy
- ✨ 新會員 sign-up 自動 seed 3 個預設板塊（PL/pgSQL trigger）
- 🎨 首頁 desktop / mobile 雙渲染，TabsList `grid-cols` 1-4 動態
- 🧱 設定後台 CRUD + 4 個板塊上限（server-side `COUNT` 守衛）

```typescript
// 從寫死 enum (BoardKey = "personal" | "family" | "subsidy")
// 進化成 data-driven 設計
export function buildBoardData(opts: {
  plates: DashboardPlateRow[];  // 使用者自訂 N 個（1-4）
  accounts: AccountRow[];
  recurring: RecurringRow[];
  transactions: TransactionRow[];
  now?: Date;
}): BoardData[]
```

---

### 🧱 多帳戶資產整合看板（N:1 binding）

板塊從 1:1 升級成 **N:1 multi-binding** — 一個板塊看「現金 + 銀行 + 信用卡」三條現金流的整合視角，貼合真實家庭金流的分散現實。

- 📊 卡片新增 headline **「資產總額」大字** = 板塊所綁定 accounts 的 `balance` 加總（信用卡負餘額自動扣減 → 淨值語意）
- 💵 子帳戶 flex justify-between：左 type icon（Banknote / CreditCard / Landmark）+ 帳戶名 / 右金額；負餘額自動 rose 染色
- 🔧 Settings 綁定 UI：Select → multi-toggle chip list（`role="checkbox" + aria-checked` 可勾多帳戶）
- 🗄️ **0013 migration**：`linked_account_id` (TEXT) → `linked_account_ids` (TEXT[])，舊值 backfill 進單元素 array 再 DROP

```sql
-- 0013_plates_multi_account_binding.sql
ALTER TABLE dashboard_plates
  ADD COLUMN IF NOT EXISTS linked_account_ids TEXT[] NOT NULL DEFAULT '{}';
UPDATE dashboard_plates
   SET linked_account_ids = ARRAY[linked_account_id]
 WHERE linked_account_ids = '{}' AND linked_account_id IS NOT NULL;
ALTER TABLE dashboard_plates DROP COLUMN IF EXISTS linked_account_id;
```

> 💡 `<Money>` 包好的 balance 自動跟著全域防窺 blur 走，N:1 結構零額外處理。

---

### 💳 三維付款方式 — 現金 / 信用卡 / 轉帳

真實消費場景的付款工具錯綜複雜（房貸走匯款、外送刷卡、小吃付現金），多個銀行戶的餘額永遠跟記帳軟體對不起來。Money Radar 把 `payment_method` 拉成**獨立資料維度**，讓每筆交易都記下「怎麼付的」：

- 🗄️ **0012 migration**：`transactions.payment_method` CHECK `IN ('cash','credit_card','transfer')` + 既有資料 backfill 規則（transfer 動作 / credit_card 帳戶 / 其餘 cash）
- 🪪 **現金錢包自動 seed**：auth.users trigger 為每個新會員 inline INSERT `accounts(type='cash')`，零配置就有「現金錢包」可記
- 🎚️ **Quick Add Segmented Control**：`💵 現金 / 💳 刷卡 / 🏦 轉帳` 三段選擇器，跟扣款帳戶**雙向綁定** — 選 cash 帳戶 → pill 自動切 cash；選 transfer pill → 帳戶自動切 bank
- 🔖 **明細頁 badge**：金額右側小圓 badge（zinc-400 低飽和不搶分類色）
- 🤖 **LINE bot 自動判**：見前面 7 階 fallback chain — 關鍵字優先、帳戶 type 暗示、預設 cash，LINE 回覆帶 emoji 即時驗證大腦判斷

---

### 📊 6 大維度分析戰情室 (`/analytics`)

分頁設計 — 「月度總覽」與「單日透視」各司其職，避免單頁資訊密度爆炸。

#### 📅 月度總覽 Tab

| # | 維度 | 視覺 | 商業價值 |
|---|---|---|---|
| 1 | **近 6 個月財務趨勢** | 雙 Y 軸 ComposedChart（Bar 收支 + Line 儲蓄率）| 長期健康度，儲蓄率 tier 染色 |
| 2 | **當月每日花費透視** | 互動式堆疊柱狀圖 | 哪天爆預算一掃就懂，點柱可跨 tab drill-down |
| 3 | **本月花費分類** | Pie + 預算消耗進度條 | 分類維度檢視，超預算 80% 黃 / 100% 紅 |
| 4 | **🧛 本月吸血鬼排行榜** | Top 5 商家 + rose progress bar | regex 清洗括號備註，揪出失血王 |
| 5 | **⚖️ 財務彈性分析** | Donut（固定 vs 浮動） + 大字硬性負擔率 | tier 化建議：<30% 安全 / 30-60% 觀望 / >60% 警戒 |
| 6 | **本月現金流向圖** | Sankey | 收入分類 → 帳戶 → 支出分類三層 flow |

#### 🗓️ 單日透視 Tab

- 「`< 2026/05/26 (二) >`」cursor 風日期 navigator（取代 DatePicker，更輕量）
- 同一張卡內按分類分組顯示當日明細
- 跨月自動 re-aggregate（5/1 按 `<` → 4/30 柱狀圖切月）

---

### 💰 淨資產戰情室 (`/net-worth`)

**月度低頻寫入** vs 首頁的「高頻現金流」刻意分家 — 存量視角 vs 流量視角不該混。

- 📸 「更新本月資產快照」Dialog — 一鍵填入所有 wealth_account 殘值
- 💎 3 大卡：總資產（emerald）/ 總負債（rose）/ 淨資產（含 MoM 月增長率 `▲ +X.X%`）
- 📈 淨資產趨勢 Area Chart + 🥧 資產配置 Pie（10 色 Apple 風 palette）
- 🧮 DB 端 `net_worth GENERATED ALWAYS AS (total_assets - total_liabilities) STORED` — 算術強制一致，應用層改不到

```sql
CREATE TABLE wealth_snapshots (
  ...
  net_worth NUMERIC(14,2) GENERATED ALWAYS AS
    (total_assets - total_liabilities) STORED,
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (user_id, recorded_at)  -- 同日 re-submit 走 UPSERT 覆蓋
);
```

---

### 🌟 夢想基金（Goal Tracker）

- 「想要」可量化為目標：name / target / current / deadline / image
- 進度條 / 倒數天數 / 達標彩帶（canvas-confetti）
- 不混進 transactions 表 — 「儲蓄分配」是抽象概念，不該污染現金流預測

---

### 📅 訂閱雷達 + Vercel Cron 主動推送

- 訂閱表 `subscriptions` + 智慧靜默 `SubscriptionAlertWidget`（≤7 天才出現）
- **Vercel Cron 每日 09:00** 掃描 → 3 天內到期 → LINE 主動 push
- 系統設計：`CRON_SECRET` HMAC 自驗，免登入

---

### 🚀 新手 Onboarding 全鏈路

第一次登入不該對一張空儀表板乾瞪眼 — 雙系統把首戰體驗鋪好：

| 系統 | 觸發 | 內容 |
|---|---|---|
| **OnboardingDialog**（3 步驟 wizard） | `profiles.has_completed_onboarding = false` 時 RSC 條件 mount | 板塊配置 → 分類管理 → 拍快照三步驟 + 跳過/完成都翻 flag |
| **OnboardingChecklist**（任務清單） | wizard 完成後在首頁掛清單 | server-side 進度（dashboard_plates / wealth_snapshots 有 row 自動勾）+ LS 進度（點過分類頁就勾）|

老用戶不打擾：`0009` migration backfill 所有現存 profile 為 `true`。三任務全完成走 CSS opacity + translate 淡出，500ms 後再 setState unmount。

### 👤 個人設定 — 連動首頁 / 趨勢圖

`profiles` 升級 3 欄位（`display_name` / `avatar_url` / `target_savings_rate`），不是裝飾位，是**連動的 source of truth**：

- 首頁歡迎詞：「歡迎回來，**{display_name}**！」
- 跨月趨勢圖儲蓄率虛線：直接吃 `target_savings_rate`（預設 20.0，CHECK 0-100 防爛資料）
- 改完 `revalidatePath` 把首頁 + 分析頁同時打髒，無需 reload

### 🔐 忘記密碼 / 重設密碼

完整 OTP recovery flow — `/forgot-password` 寄信、`/update-password` 改密碼，**改完強制登出**回登入頁（避免 token 殘留視窗繼續操作）。Supabase recovery token 走 URL fragment，proxy whitelist 把 `/update-password` 加進 matcher 排除清單避免 redirect 剝離（memory: `proxy_public_routes_whitelist`）。

### 💡 HelpTip Contextual Help

3 個最硬核的功能（**🧛 吸血鬼排行榜**、**⚖️ 財務彈性**、**📈 分類趨勢**）旁邊掛 `ℹ️` icon — base-ui Tooltip 包一層 `HelpTip`，hover / tap 解釋「這數字怎麼算、tier 怎麼切」。讓使用者不用回 README 也能讀懂自己的數字。

### 📱 More Hub — 行動版導覽重排

手機底部 tab 只有 5 格，硬塞「夢想 + 設定」會逼觸控目標縮到 < 44pt：

- 5 格底部 tab 留給高頻：首頁 / 分析 / 記帳 / 訂閱 / **更多**
- 「更多」進中轉頁 `/(dashboard)/more` — 兩張漸層大卡（emerald 夢想 / slate 設定）
- 桌面 viewport 自動 `router.replace("/settings")`（sidebar 已有直連）
- viewport 從 mobile → desktop 旋轉 / resize 也跟著 redirect（`matchMedia` change listener）

---

### 🕶️ 全域防窺模式（Privacy Mode）

> **demo 給 PM / 朋友看「我的戰情系統」時，金額一鍵糊掉，量級感保留。**

- 🎚️ 右上眼睛 icon 切換（`Eye` ↔ `EyeOff` 交叉淡入 framer-motion 動畫）
- 💾 localStorage 持久化
- ⚡ **CSS-only blur** — `body[data-privacy="on"]` 切換時零 React re-render

```css
/* globals.css — 一條 rule 解決整個 app */
body[data-privacy="on"] [data-money],
body[data-privacy="on"] .recharts-tooltip-wrapper,
body[data-privacy="on"] .recharts-surface text {
  filter: blur(6px);
  user-select: none;          /* 拖選不到 */
  pointer-events: none;
  -webkit-user-select: none;
}

body[data-privacy="on"] [data-money]::selection {
  background: transparent;   /* 複製貼上是空字串 */
}
```

`<AnimatedNumber>` 跟 `<Money>` 包裝自動帶 `data-money` 屬性 → **18+ 個 caller 零改動**。Recharts 整個 SVG `<text>` 也一網打盡。

---

### 🪟 邊緣懸停可摺疊側邊欄（Hover-to-Reveal）

桌面 sidebar `w-64 ↔ w-20` 可摺疊釋放圖表寬度，全套設計細節對齊 Notion / Linear / VSCode 的水準：

- 🎚️ **localStorage 持久化** — `SidebarCollapsedProvider` 仿 `PrivacyProvider` pattern，整支 Context + mounted guard 防 SSR hydration mismatch
- 🔄 **主內容連動** — `<MainPad>` 讀 collapsed state，`md:pl-20 ↔ md:pl-64` 跟著 300ms ease-in-out 滑動，圖表/表格真的向左外推變更寬
- 🫥 **三層觸發 Hover-to-Reveal toggle** — 預設 `opacity-0 scale-95 pointer-events-none` 完全隱藏。觸發點：
  - `group-hover` → 滑鼠移到 sidebar 任何位置
  - `group-focus-within` → 鍵盤 tab 進 sidebar 內任何 nav item（不犧牲 a11y）
  - `focus-visible` → 鍵盤直接 focus 到按鈕本身（自我喚醒 + ring）
- ✨ **邊框微光** — 滑鼠 hover 時右邊框從 `zinc-900` 升到 `zinc-800`，給 moody dark edge 回饋
- 🏷️ **摺疊時 Tooltip 補位** — 每個 nav item 用 base-ui Tooltip(side="right") 顯示中文標籤；展開時 pass-through 不包，避免雙重 label
- 🍃 **3 個 toggle 元件** — PrivacyToggle / ThemeToggle / SignOutButton 加 `collapsed?: boolean` prop，文字 span 套 `w-0 opacity-0 overflow-hidden transition-all` 平滑淡出

```tsx
// Sidebar group + 三層觸發點全部 declarative
<aside className="group border-r border-zinc-900 hover:border-zinc-800 focus-within:border-zinc-800">
  ...
  <button className="
    absolute top-12 -right-3 z-50
    opacity-0 scale-95 pointer-events-none transition-all duration-200
    group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto
    group-focus-within:opacity-100 focus-visible:opacity-100
  ">
    {collapsed ? <ChevronRight /> : <ChevronLeft />}
  </button>
</aside>
```

---

### ⚡ Demo 模式 — Open-Source 開箱即用

為 fork repo 嘗鮮 / 面試展示量身打造的「一鍵長出 6 個月精美理財資料」按鈕，讓新使用者進來不再對著空儀表板乾瞪眼。

- 🔐 **雙閘 env gate** — `NODE_ENV='development'` 或 `NEXT_PUBLIC_ENABLE_DEMO_SEED='true'` 二擇一才放行，正式環境預設**按鈕完全不渲染**
- 📦 **6 個月 × 7 樣板 = ~36 筆 [DEMO] 交易** — 固定 3 筆（房貸 25k / 托育 18k / 保險 4.5k 走 transfer）+ 浮動 4 筆（餐飲 / 加油 walk cash/credit_card 輪替），amount ±15% jitter 自然抖動
- 📈 **6 筆月底 wealth_snapshots** — 100 萬 → 125 萬漸層 + 三大資產分類 details JSONB；UPSERT 處理 `(user_id, recorded_at)` UNIQUE 重複按鈕安全
- 🧹 **[DEMO] 前綴清理友好** — 所有 demo 交易 description 帶 `[DEMO]` 標記；到 `/transactions` 搜 `[DEMO]` 批次找到刪
- 🌈 **發光漸層按鈕** — `from-indigo-500 via-purple-500 to-pink-500` + confirm dialog 強制讀完 4 條警告（資料規模 / 標記 / 清理 / 重複疊加）才放行

```ts
// 雙閘判定 — server action 與 client 按鈕共用同一條件
const allowed =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED === "true";
```

> 💡 fork 部署到 Vercel 想對外展示？只要設 `NEXT_PUBLIC_ENABLE_DEMO_SEED=true`，按鈕就在 `/settings` 底部現身。原始作者 production 預設不啟用，零誤觸風險。

### 📊 圖表空白狀態防護

剛 clone repo 第一次跑、或 demo 模式還沒啟動前，所有 Recharts 圖表都有共用 `ChartEmptyState` 元件接管 — **不會崩潰、不會空白、不會顯示誤導性的 mock 假資料**：

- 🎨 半透明 mock 圖（`opacity-[0.12]`）當背景預告即將出現的視覺
- 🪧 前景疊 Lucide `BarChart3` icon + 引導文字「📊 戰情室正在等待數據，試著新增您的第一筆帳務吧！」
- 🎭 `currentColor` 自動跟 dark/light 主題走，無需寫死配色

---

## 🛠️ 技術棧

### Front-end

| 套件 | 版本 | 角色 |
|---|---|---|
| **Next.js** | 16.2 | App Router + Turbopack（dev / build 預設）+ RSC |
| **React** | 19 | Server Components + `use` hook |
| **TypeScript** | strict | Discriminated `MutationResult` / nullable narrowing |
| **Tailwind CSS** | v4 | Apple 金融美學配色 + `@theme inline` design tokens |
| **base-ui/react** | 1.5 | Headless primitives (Dialog / Select / Tabs / Progress) |
| **shadcn/ui** | — | 視覺 token 來源（封裝層走 base-ui，不是 Radix）|
| **Recharts** | 3.x | Line / Bar / Pie / Area / Sankey / ComposedChart |
| **Framer Motion** | 12 | 微互動 + PageTransition + 數字滾動 |
| **lucide-react** | 1.x | Icon system（200+ 一致圖示）|
| **sonner** | 2.x | Top-center toast |
| **next-themes** | 0.4 | 深淺色切換（system / light / dark）|

### Back-end / Infra

| 服務 | 用途 |
|---|---|
| **Supabase Postgres** | 主資料庫 + RLS 多租戶隔離 + auth.users |
| **Supabase Auth** | OAuth + email/password + cookie-based session |
| **`@supabase/ssr`** | RSC / middleware 共用 server client |
| **OpenAI** | Whisper STT（語音）+ GPT-4o Vision（發票）|
| **Google Gemini** | LINE bot 文字訊息分類 fallback |
| **LINE Messaging API** | webhook 入帳 + 主動 push 訂閱警報 |
| **Vercel** | Edge functions + Cron + 部署 |

---

## 🏛️ 系統架構

```
┌─────────────────────────────────────────────────────────┐
│  LINE                Web (Next 16 / RSC)                │
│  ↓                   ↓                                   │
│  /api/line/webhook   /(dashboard)/*                     │
│  - Whisper STT       - PageTransition + Money + Privacy │
│  - GPT-4o Vision     - 30+ data-viz components          │
│  - Gemini classify   - Theme-aware (next-themes)        │
│  ↓                   ↓                                   │
│  Server Actions (revalidatePath 即時連動)               │
│  ↓                                                       │
│  Supabase Postgres                                      │
│  ├─ auth.users (Supabase Auth)                          │
│  ├─ users / accounts / transactions                     │
│  ├─ recurring_payments / subscriptions                  │
│  ├─ categories (+ keywords + is_fixed + budget)         │
│  ├─ goals / goal_logs                                   │
│  ├─ wealth_accounts / wealth_snapshots                  │
│  ├─ dashboard_plates                                    │
│  └─ system_settings / profiles                          │
│  ↑                                                       │
│  Vercel Cron (09:00 daily)                              │
│  /api/cron/subscription-alert → LINE push               │
└─────────────────────────────────────────────────────────┘
```

### 資料庫亮點

- **9+ 張表 / 30+ RLS policy / 13 個 migration**：所有資料以 `auth.uid() = user_id` 強制多租戶隔離
- **DB 端 invariant**：`wealth_snapshots.net_worth` GENERATED STORED；`transactions.user_id` DEFAULT `auth.uid()` — 應用層連碰都碰不到，零繞過可能
- **BEFORE INSERT trigger** 自動 backfill：`categories.is_fixed` 依 code、`dashboard_plates` 依 user 自動 seed 3 條預設
- **`(user_id, recorded_at)` UNIQUE** + ON CONFLICT — 同日重複拍快照走 UPSERT 覆蓋，避免汙染趨勢線

---

## 🔬 工程亮點 (Engineering Deep Dives)

### 1. `createPortal` 救援被 stacking context 困住的 FAB

行動版「+ 記帳」FAB 看得到、點不到 — 因為 framer-motion 的 `motion.div`（`PageTransition`）會留下 inline `transform` 樣式，**同時建立 stacking context 與 `position: fixed` containing block**，把 `z-50` 困死在區域內，被 `z-30` 的底部 tab bar 蓋住。

```tsx
// 用 React Portal 把 trigger 渲染到 document.body
// 跳脫所有祖先的 transform / stacking context
<BodyPortal>
  <Button
    onClick={() => handleOpenChange(true)}
    className="fixed right-5 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 ..."
  >
    <Plus /> 記帳
  </Button>
</BodyPortal>
```

> 💡 **Lesson**：framer-motion 的 transform 會建立 containing block — 把任何 `position: fixed` 元素「rebase」到 motion.div 而非 viewport。Portal 是 idiomatic 解法。

### 2. base-ui 1.5 `<DialogTrigger render={<Button />}>` silent 失效

兩層 `useButton()` hook 互搶 `onClick`，UI 沒任何 error 但點下去毫無反應。**Memory 寫了** — 之後寫 Dialog 一律走 controlled `open` + 純 `<Button onClick>`：

```tsx
// ❌ 不要這樣寫（會 silent 失敗）
<Dialog>
  <DialogTrigger render={<Button>開啟</Button>}>...</DialogTrigger>
</Dialog>

// ✅ 對的寫法
<>
  <Button onClick={() => setOpen(true)}>開啟</Button>
  <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent>...</DialogContent>
  </Dialog>
</>
```

### 3. Privacy mode = CSS attribute selector，零 React re-render

切換防窺只寫 `document.body.dataset.privacy = "on"`，**整個 React 樹不動**。所有 `<Money>` / `<AnimatedNumber>` / Recharts 元件透過 CSS 一條 rule 統一 blur。Context 只負責 1 個 bool + 1 個 setter。

### 4. `resolveCategory` 單一 source of truth

圖表的 stack 顏色、細項清單的卡片、預算進度條，三邊看到的「同一筆 transaction.category」永遠對得起來 — 因為它們**共用同一支 `resolveCategory(code, byCode)`** 函式。改規則只動一處。

### 5. 雙向綁定的單日 drill-down

```
selectedDate (string) lifted to AnalyticsView
  ├── Monthly tab 的 DailySpendChart 點柱 → setSelectedDate + setTab("daily")
  ├── Daily tab 的 < 日期 > navigator → setSelectedDate
  └── 切回 Monthly tab → chart 還會 highlight 剛剛看的那天（視覺連續性）
```

跨 tab drill-down + state 共享 + 月份守衛（避免「我在 4 月卻看到 5/15 框框」的視覺錯亂）。

---

## 🚀 Getting Started

### 1. Clone + 安裝

```bash
git clone <your-repo>
cd finance-radar
pnpm install   # or npm / yarn / bun
```

### 2. 環境變數

`.env.local`：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role>  # webhook 寫入用

# LINE Bot (optional, AI 記帳要用)
LINE_CHANNEL_ACCESS_TOKEN=<>
LINE_CHANNEL_SECRET=<>

# AI (optional)
OPENAI_API_KEY=<>     # Whisper + Vision
GEMINI_API_KEY=<>     # 分類 fallback

# Vercel Cron 自驗
CRON_SECRET=<random-long-string>

# Demo 模式（fork 部署想對外展示就 true；本機 dev 不設也預設開啟）
NEXT_PUBLIC_ENABLE_DEMO_SEED=false
```

### 3. 跑 Migration

把 `supabase/migrations/` 13 個 `.sql` 依序貼到 **Supabase Dashboard → SQL Editor** 執行：

| Migration | 內容 |
|---|---|
| `0001` | transactions 加 transfer 支援 + recurring_payments 升級 |
| `0002` | 種子帳戶（個人化資料，自行調整）|
| `0003` | recurring_payments.frequency 加 'semi_annually' |
| `0004` | wealth_module（淨資產 / 月度快照）|
| `0005` | transactions.category nullable（income 沒分類）|
| `0006` | categories.is_fixed + 4 個固定 code backfill |
| `0007` | dashboard_plates + RLS + seed trigger |
| `0008` | 補回 accounts.id DEFAULT（修新會員註冊 "Database error" bug）|
| `0009` | profiles.has_completed_onboarding（Onboarding wizard flag，老用戶 backfill 為 true）|
| `0010` | profiles 個人設定 3 欄位（display_name / avatar_url / target_savings_rate）+ update RLS |
| `0011` | categories.default_account_id + profiles.default_account_id（LINE 帳戶 fallback chain 鋪路）|
| `0012` | transactions.payment_method 維度（cash / credit_card / transfer）+ accounts_type_check 擴 'cash' + auth.users trigger 自動 seed 現金錢包 |
| `0013` | dashboard_plates 從 1:1 升級 N:1：`linked_account_id` → `linked_account_ids TEXT[]` + backfill + DROP 舊欄 |

### 4. 啟動

```bash
pnpm dev      # http://localhost:3000
pnpm build    # 生產編譯（Turbopack）
pnpm lint     # ESLint
```

---

## 📁 專案結構

```
src/
├── app/
│   ├── (auth)/               # 登入 / 忘記密碼 / 重設密碼（不掛 Navigation）
│   │   ├── login/
│   │   ├── forgot-password/  # 寄 OTP recovery 信
│   │   └── update-password/  # 改完強制登出
│   ├── (dashboard)/          # 受保護路由群組
│   │   ├── page.tsx          # 首頁戰情室（含 Onboarding wizard + checklist）
│   │   ├── analytics/        # 分析頁（月度 + 單日 Tabs）
│   │   ├── transactions/     # 歷史明細 + 搜尋
│   │   ├── goals/            # 夢想基金
│   │   ├── net-worth/        # 淨資產 / 快照
│   │   ├── recurring/        # 固定收支
│   │   ├── more/             # 行動版「更多」中轉頁（桌面自動 redirect /settings）
│   │   └── settings/         # 系統設定 / 板塊 / 分類 / 訂閱 / 預設帳戶 / 個人設定
│   ├── api/
│   │   ├── line/webhook/     # LINE 多模態入帳（LLM JSON + fallback chain）
│   │   └── cron/             # Vercel Cron 訂閱警報
│   └── proxy.ts              # Next 16 middleware → proxy 改名
├── components/
│   ├── dashboard/            # 業務元件（30+ 個，含 onboarding-dialog / checklist / profile-settings-card）
│   ├── ui/                   # 視覺 primitives（shadcn token + base-ui，含 tooltip / help-tip）
│   ├── privacy-provider.tsx  # 全域防窺 Context
│   └── theme-provider.tsx
└── lib/
    ├── actions/              # Server Actions（CRUD，含 onboarding / profile）
    ├── dashboard.ts          # 核心聚合（板塊、預測、metrics）
    ├── daily-spend.ts        # 每日花費 + drill-down
    ├── cross-month-trend.ts  # 6 個月趨勢 + 儲蓄率（吃 profile.target_savings_rate）
    ├── financial-elasticity.ts # 固定 vs 浮動 + tier
    ├── top-merchants.ts      # 🧛 吸血鬼排行榜
    ├── wealth.ts             # 淨資產聚合
    ├── load-onboarding.ts    # Onboarding wizard 狀態
    ├── load-onboarding-progress.ts # checklist 三任務進度
    ├── load-profile.ts       # 個人設定（暱稱 / 目標 / 預設帳戶）
    └── supabase/             # SSR / server / client 三套 client
```

---

## 🗺️ 路線圖

- [x] ~~1:N plate-account mapping~~ — 0013 落地，板塊已支援多帳戶綁定
- [x] ~~LINE bot payment_method 智慧判定~~ — 0012 + LLM prompt 升級已落地
- [x] ~~Demo 模式（一鍵 seed 展示資料）~~ — open-source 開箱即用
- [ ] 自訂 emoji + 拖拉排序 plates
- [ ] 預算超標 LINE push 警報
- [ ] 收入分類（薪資 / 副業 / 投資配息）
- [ ] CSV / PDF 報表匯出
- [ ] Plaid / Open Banking 自動串接
- [ ] PWA 離線記帳

---

## 📜 License

MIT — fork it, build your own variation.

---

<div align="center">

**Crafted with 🧠 by someone who got tired of crap finance apps.**

</div>
