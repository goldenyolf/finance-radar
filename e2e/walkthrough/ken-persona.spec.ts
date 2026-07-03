import { test, expect, type Page } from "@playwright/test";

import { TEST_EMAIL, testPassword } from "./_creds";

// ─── Persona-specific config ─────────────────────────────────────────────────
// Ken 老王 — 45 歲家庭主計 / IT 白領。竹科工程師，家裡財務他負責記帳。
// 技術素養高，但生活情境下希望像用 iPhone 一樣不用學。
const PERSONA = "ken";
const FRONTEND_URL = "http://localhost:3000";
const LOGIN_EMAIL = TEST_EMAIL;
const SCREENSHOT_DIR = "e2e/walkthrough/screenshots";

// ─── Browser config (pinned in-spec, not via CLI) ─────────────────────────────
// Headless: 避免搶走使用者前景視窗焦點。
// Viewport 1920x1080: 桌面 persona 標準解析度，保 screenshot 尺寸穩定。
test.use({
  headless: true,
  viewport: { width: 1920, height: 1080 },
});


// ─── Soft check helper ────────────────────────────────────────────────────────
type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Anomaly = {
  uc: number;
  severity: Severity;
  title: string;
  detail: string;
};
const anomalies: Anomaly[] = [];

async function softCheck(
  uc: number,
  label: string,
  severity: Severity,
  fn: () => Promise<void>
) {
  try {
    await fn();
    console.log(`  [PASS] UC${uc}: ${label}`);
  } catch (e) {
    const msg = (e as Error).message.split("\n")[0].slice(0, 200);
    console.log(`  [FAIL] UC${uc}: ${label} — ${msg}`);
    anomalies.push({ uc, severity, title: label, detail: msg });
  }
}

function recordAnomaly(uc: number, severity: Severity, title: string, detail: string) {
  anomalies.push({ uc, severity, title, detail });
  console.log(`  [${severity}] UC${uc}: ${title} — ${detail}`);
}

async function shot(page: Page, uc: number, step: number) {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${PERSONA}-uc${uc}-step${step}.png`,
    fullPage: true,
  });
}

// ─── Login (shared across UCs) ────────────────────────────────────────────────
async function loginAs(page: Page, email: string, password: string) {
  await page.goto(`${FRONTEND_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 }),
    page.click('button[type="submit"]'),
  ]);
  // 給 RSC streaming 時間；networkidle 對 Suspense 不穩，改等真的看得到「本月總支出」文字
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
}

/**
 * 等 dashboard 主要 Suspense 群 hydrate 完成 — 用首頁 header「歡迎回來」浮現當 anchor。
 * 這個 header 是 RSC data 到齊後才 render（要等 profile / dashboard load 完），
 * 所以看到它就代表 skeleton 已被真內容取代。
 */
async function waitForDashboardReady(page: Page, timeoutMs = 30_000) {
  try {
    await page
      .getByRole("heading", { name: /歡迎回來/ })
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    // 讓後續 assertion 自己噴 anomaly；這裡不 throw
  }
}

// Utility: 帶關鍵字唯一定位當日「早餐」該筆 — UC3/UC4 共用
// 用 label 附近的 amount 60 交叉驗證；避免撞到過往紀錄
async function findKenBreakfastRow(page: Page) {
  // 交易列 <li> 的結構：checkbox / date / title / amount / actions
  // 標題文字 = "早餐"（strict） + 金額字串含 "60"
  const rows = page.locator("li").filter({ hasText: "早餐" });
  return rows;
}

// ─── Walkthrough ──────────────────────────────────────────────────────────────
test.describe.configure({ mode: "serial" });

test.describe("Ken persona walkthrough — 家庭主計的日常四場戲", () => {
  // 首次 hydrate 需拉多支 RSC + Supabase；單 test 拉高 timeout。
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await loginAs(page, LOGIN_EMAIL, testPassword());
  });

  // ═══════════════════════════════════════════════════════════════════════
  // UC1: 早上 8:00 掃戰情室 — 3 秒內判斷本月健康度
  // ═══════════════════════════════════════════════════════════════════════
  test("UC1: 早上掃戰情室判斷本月健康度", async ({ page }) => {
    console.log("\n── UC1: 早上 8:00 掃戰情室 ──");
    // Step 1: 登入完成應該直接落地首頁
    await shot(page, 1, 1);

    // 給 dashboard Suspense 群喘一口氣把 skeleton 換掉
    await waitForDashboardReady(page, 25_000);
    await shot(page, 1, 2);

    // Step 2: Ken 期望「3 秒內看到本月現金流健康度」— 我們檢查首頁的
    //         「本月現金流大字」是否存在。實際版面用 3 個板塊卡（家庭/個人/…）
    //         各顯示本月預算/實際；不是單一 hero KPI。
    const singleKpiHeadlines = [
      "本月總支出",
      "本月總收入",
      "本月結餘",
      "本月淨流入",
      "本月現金流",
    ];
    let foundSingleKpi = false;
    for (const t of singleKpiHeadlines) {
      if ((await page.getByText(t, { exact: false }).count()) > 0) {
        foundSingleKpi = true;
        console.log(`    首頁偵測到 KPI headline：「${t}」`);
        break;
      }
    }
    if (!foundSingleKpi) {
      recordAnomaly(
        1,
        "HIGH",
        "首頁沒有「本月現金流健康度」單一大字 KPI",
        "版面用 3 個板塊卡（家庭 / 個人 / 補助…）各顯示本月預算/實際，Ken 得逐板塊掃再心算加總才知道整體，未達「3 秒判斷健康度」目標"
      );
    }

    // Step 3: 板塊卡是否至少有 render 出來（BoardCard）— 找「本月已用」或
    //         board-card 的關鍵字。找不到 → CRITICAL（首頁真的空）。
    const boardKeywords = ["本月", "預算", "已用", "剩餘", "板塊"];
    const foundBoardKeywords: string[] = [];
    for (const k of boardKeywords) {
      if ((await page.getByText(k, { exact: false }).count()) > 0) {
        foundBoardKeywords.push(k);
      }
    }
    console.log(`    首頁板塊關鍵字命中: ${foundBoardKeywords.join(" / ") || "(無)"}`);
    if (foundBoardKeywords.length === 0) {
      recordAnomaly(
        1,
        "CRITICAL",
        "首頁看不到任何板塊/預算相關內容",
        `檢查了 [${boardKeywords.join(", ")}] 皆為 0 命中`
      );
    }

    // Step 4: 判斷是否有紅字警告（AI 智慧預警 / breach）
    const alertCandidates = [
      "資金缺口預警",
      "跌破安全門檻",
      "跌破",
      "超支",
      "警告",
      "扣款警報",
      "訂閱扣款",
    ];
    const foundAlerts: string[] = [];
    for (const t of alertCandidates) {
      if ((await page.getByText(t, { exact: false }).count()) > 0) foundAlerts.push(t);
    }
    console.log(`    紅字/預警偵測: ${foundAlerts.join(" / ") || "(此帳號本月無警報 — 中性)"}`);
    await shot(page, 1, 3);

    // Step 5: 快速記帳按鈕應該一眼看到（Ken 之後就要用它）
    await softCheck(1, "「快速記帳」入口按鈕在首頁 hero 區", "HIGH", async () => {
      await expect(
        page.getByRole("button", { name: /快速記帳/ }).first()
      ).toBeVisible({ timeout: 5_000 });
    });

    // Step 6: 檢查 header 是否顯示 profile display_name（Ken 是他自己還是 Austin?）
    const headerText =
      (await page
        .getByRole("heading", { name: /歡迎回來/ })
        .first()
        .innerText()
        .catch(() => "")) || "";
    console.log(`    首頁 header：${headerText}`);

    // Step 7: onboarding checklist — Ken 是老用戶了不該還看到 4 步驟
    const onboardingHints = ["補完檔案", "綁定 LINE", "配置板塊", "拍第一張快照"];
    const foundOnboarding: string[] = [];
    for (const t of onboardingHints) {
      if ((await page.getByText(t, { exact: false }).count()) > 0) foundOnboarding.push(t);
    }
    if (foundOnboarding.length > 0) {
      console.log(`    偵測到 onboarding checklist 未完成: ${foundOnboarding.join(" / ")}`);
      // 這是「dev 帳號本身沒完成 onboarding」的 state，不是產品 bug — 只 log
    }

    // Step 8: 看看有沒有「跨月趨勢」/「未來 6 個月現金流」等 3 秒能掃到的區塊
    const scannableBlocks = [
      "未來 6 個月現金流",
      "現金流展望",
      "夢想基金",
      "本月支出分類",
      "近期",
    ];
    const foundScannable: string[] = [];
    for (const b of scannableBlocks) {
      if ((await page.getByText(b, { exact: false }).count()) > 0) foundScannable.push(b);
    }
    console.log(`    首頁掃描到可讀區塊: ${foundScannable.join(" / ") || "(無)"}`);
    await shot(page, 1, 4);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // UC2: 中午 12:30 用「快速記帳」記一筆 60 元早餐（現金）
  // ═══════════════════════════════════════════════════════════════════════
  test("UC2: 用快速記帳新增現金 60 元早餐", async ({ page }) => {
    console.log("\n── UC2: 中午 12:30 記 60 元早餐 ──");
    await waitForDashboardReady(page, 25_000);
    await shot(page, 2, 1);

    // Step 1: 點右上「快速記帳」按鈕開 dialog
    const trigger = page.getByRole("button", { name: /快速記帳/ }).first();
    await softCheck(2, "「快速記帳」按鈕可見且可點", "CRITICAL", async () => {
      await expect(trigger).toBeVisible({ timeout: 5_000 });
      await expect(trigger).toBeEnabled();
    });
    await trigger.click();

    // Step 2: Dialog 應打開，看到「快速記帳」title
    await softCheck(2, "「快速記帳」dialog 打開", "CRITICAL", async () => {
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole("dialog").getByText("快速記帳", { exact: true })).toBeVisible();
    });
    await shot(page, 2, 2);

    const dialog = page.getByRole("dialog");

    // Step 3: 「支出」tab 該預設 active — base-ui Tab 用 aria-selected 揭露狀態
    const expenseTab = dialog.getByRole("tab", { name: /支出/ });
    await softCheck(2, "支出 tab 預設為 selected（開 dialog 就是支出模式）", "HIGH", async () => {
      await expect(expenseTab).toHaveAttribute("aria-selected", "true", { timeout: 3_000 });
    });

    // Step 4: 填「項目名稱」= 早餐
    const descInput = dialog.getByLabel("項目名稱");
    await softCheck(2, "「項目名稱」input 可見", "CRITICAL", async () => {
      await expect(descInput).toBeVisible();
    });
    await descInput.fill("早餐");

    // Step 5: 填金額 60
    const amountInput = dialog.getByLabel(/金額/);
    await softCheck(2, "「金額」input 可見", "CRITICAL", async () => {
      await expect(amountInput).toBeVisible();
    });
    await amountInput.fill("60");
    await shot(page, 2, 3);

    // Step 6: 付款方式選「現金」— 檢查 pill 是否已預設 active（如果第一個帳戶是 cash）
    const cashPill = dialog.getByRole("radio", { name: "現金" });
    const cashChecked = await cashPill.getAttribute("aria-checked").catch(() => null);
    if (cashChecked === "true") {
      console.log("    現金付款方式已預設 active（第一個帳戶為 cash type）");
    } else {
      console.log("    現金 pill 非預設 — Ken 需手動點；點下去…");
      await cashPill.click();
      await softCheck(2, "點擊後現金 pill 切為 active", "MEDIUM", async () => {
        await expect(cashPill).toHaveAttribute("aria-checked", "true", { timeout: 2_000 });
      });
    }
    await shot(page, 2, 4);

    // Step 7: 扣款帳戶應該自動綁「隨身現金」/ 現金錢包類的帳戶
    // 檢查 select 顯示的名稱是否含「現金」
    // base-ui Select trigger 用 button role + textContent
    const accountSelect = dialog.getByRole("combobox").first();
    let accountLabelText = "";
    try {
      accountLabelText = (await accountSelect.innerText()).trim();
    } catch {
      // fall back：直接抓 label 附近的 button
      const alt = dialog.locator('[id][role="combobox"], button[data-slot="select-trigger"]').first();
      accountLabelText = (await alt.innerText().catch(() => "")).trim();
    }
    console.log(`    扣款帳戶 select 顯示：「${accountLabelText}」`);
    if (!accountLabelText || !/(現金|錢包|Cash)/i.test(accountLabelText)) {
      recordAnomaly(
        2,
        "HIGH",
        "選現金 pill 後扣款帳戶未自動綁到現金錢包",
        `select 顯示 "${accountLabelText}"，未匹配現金/錢包關鍵字`
      );
    } else {
      console.log("    帳戶自動綁定看起來正常");
    }

    // Step 8: 送出
    await shot(page, 2, 5);
    const submitBtn = dialog.getByRole("button", { name: /新增交易|新增收入|建立轉帳|儲存中/ });
    await softCheck(2, "送出按鈕存在且可按", "CRITICAL", async () => {
      await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    });
    await submitBtn.click();

    // Step 9: 等 toast — sonner toast 掛在 body, role="status" 或 data-sonner-toast
    // 給予寬容時間；toast 一閃即逝可能抓不到，用 waitForResponse 兜底也可以
    let toastSeen = false;
    try {
      await page
        .locator('[data-sonner-toast], [role="status"]', { hasText: /已新增交易|新增/ })
        .first()
        .waitFor({ state: "visible", timeout: 6_000 });
      toastSeen = true;
      console.log("    Toast 出現：已新增交易");
    } catch {
      console.log("    未捕捉到 toast — 可能一閃即逝或已消失");
    }
    await shot(page, 2, 6);

    // Step 10: dialog 應關閉
    await softCheck(2, "送出後 dialog 關閉", "HIGH", async () => {
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 8_000 });
    });

    if (!toastSeen) {
      // Non-fatal — 但記為 LOW，因為 Ken 需要「送出成功」的信心提示
      recordAnomaly(
        2,
        "LOW",
        "送出後未觀察到成功 toast",
        "toast 可能太快消失，或未觸發；記帳完得靠 dialog 關閉判斷成功，信心不足"
      );
    }
    await shot(page, 2, 7);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // UC3: 下班 18:00 走 /transactions 查早餐這筆
  // ═══════════════════════════════════════════════════════════════════════
  test("UC3: 到明細頁搜尋早餐該筆", async ({ page }) => {
    console.log("\n── UC3: 下班查明細 ──");

    // Step 1: 走 nav 進「明細」— sidebar link "明細"
    // Desktop sidebar 需等 dashboard 起來（sidebar 是 layout 一部分，但穩定起見）
    await waitForDashboardReady(page, 20_000);
    const navLink = page.getByRole("link", { name: /^明細$/ });
    await softCheck(3, "sidebar 有「明細」nav 項目", "CRITICAL", async () => {
      await expect(navLink.first()).toBeVisible({ timeout: 5_000 });
    });
    await navLink.first().click();
    await page.waitForURL(/\/transactions/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    // 等交易頁面搜尋框浮現才算 ready
    await page
      .getByPlaceholder(/尿布|午餐|多關鍵字/)
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
    await shot(page, 3, 1);

    // Step 2: 搜尋框應可見（placeholder 含「尿布、午餐」）
    const searchInput = page.getByPlaceholder(/尿布|午餐|多關鍵字/);
    await softCheck(3, "搜尋框可見", "CRITICAL", async () => {
      await expect(searchInput.first()).toBeVisible({ timeout: 5_000 });
    });

    // Step 3: 打「早餐」— transactions-view 的搜尋走 server action + debounce。
    // 先等 loading spinner 消失（或至少 2s buffer），再抓結果。
    await searchInput.first().fill("早餐");
    // 等「搜尋疊整」摘要文字浮現，這是搜尋結果收到後才 render 的 marker；
    // 或最長 6 秒 fallback。
    await page
      .getByText(/搜尋疊整|找不到符合/, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 6_000 })
      .catch(() => {});
    // 保險再多等一下讓 list 完成渲染
    await page.waitForTimeout(500);
    await shot(page, 3, 2);

    // Step 4: 結果應該至少有一筆
    const rows = page.locator("ul > li").filter({ hasText: "早餐" });
    const rowCount = await rows.count();
    console.log(`    搜尋結果中 "早餐" 筆數: ${rowCount}`);
    if (rowCount === 0) {
      recordAnomaly(
        3,
        "CRITICAL",
        "剛才 UC2 記的早餐查不到",
        "搜尋框輸入「早餐」後 0 筆結果，UC2 寫入未持久化或索引未即時更新"
      );
      await shot(page, 3, 3);
      return; // 沒得檢查下去了
    }

    // Step 5: 找出金額為 60 或包含 60 的今日這筆
    // 逐筆撈 innerText，找符合「今天日期 + 早餐 + 60」
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    // 常見顯示格式：M/D 或 MM/DD
    const dateNeedle1 = `${today.getMonth() + 1}/${today.getDate()}`;
    const dateNeedle2 = `${mm}/${dd}`;

    let targetIndex = -1;
    let targetText = "";
    for (let i = 0; i < rowCount; i++) {
      const t = (await rows.nth(i).innerText()).replace(/\s+/g, " ");
      if (t.includes("60") && (t.includes(dateNeedle1) || t.includes(dateNeedle2))) {
        targetIndex = i;
        targetText = t;
        break;
      }
    }
    if (targetIndex === -1) {
      // fallback: 取第一筆看看能不能識別
      targetIndex = 0;
      targetText = (await rows.first().innerText()).replace(/\s+/g, " ");
      recordAnomaly(
        3,
        "MEDIUM",
        "找不到「今天 + 早餐 + 60」精準匹配的那筆",
        `退化用第一筆比對；第一筆內容：${targetText.slice(0, 200)}`
      );
    }
    console.log(`    目標列 innerText: ${targetText.slice(0, 300)}`);
    await shot(page, 3, 3);

    // Step 6: 這筆分類應該是「餐飲食品」（早餐關鍵字命中）
    await softCheck(3, '早餐該筆分類 = "餐飲食品"', "HIGH", async () => {
      // 允許在整個列容器中出現「餐飲食品」文字
      expect(targetText).toMatch(/餐飲食品/);
    });
    if (!/餐飲食品/.test(targetText)) {
      // 額外檢查是不是被歸到「其他」
      if (/其他/.test(targetText)) {
        recordAnomaly(
          3,
          "HIGH",
          "早餐關鍵字未命中預設分類，落入「其他」",
          `期望：餐飲食品；實際列文字包含「其他」；可能是 classifyByKeyword 沒吃到「早餐」（migration 0029 曾移除「早餐」關鍵字）`
        );
      }
    }

    // Step 7: 現金 badge — 我們的 PaymentMethodBadge 是 icon-only + aria-label="現金"
    await softCheck(3, "此列有「現金」付款方式 badge", "HIGH", async () => {
      const badgeCount = await rows
        .nth(targetIndex)
        .locator('[aria-label="現金"], [title="現金"]')
        .count();
      expect(badgeCount).toBeGreaterThan(0);
    });

    await shot(page, 3, 4);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // UC4: 晚上 21:00 給這筆早餐加上「太太醫療」專案標籤
  // ═══════════════════════════════════════════════════════════════════════
  test("UC4: 編輯早餐該筆並貼上專案標籤「太太醫療」", async ({ page }) => {
    console.log("\n── UC4: 晚上 21:00 貼專案標籤 ──");

    // Step 1: 進明細頁、搜「早餐」定位那筆
    await waitForDashboardReady(page, 20_000);
    await page.getByRole("link", { name: /^明細$/ }).first().click();
    await page.waitForURL(/\/transactions/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    const searchInput = page.getByPlaceholder(/尿布|午餐|多關鍵字/).first();
    await searchInput.waitFor({ state: "visible", timeout: 15_000 });
    await searchInput.fill("早餐");
    await page
      .getByText(/搜尋疊整|找不到符合/, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 6_000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, 4, 1);

    const rows = page.locator("ul > li").filter({ hasText: "早餐" });
    const rowCount = await rows.count();
    if (rowCount === 0) {
      recordAnomaly(4, "CRITICAL", "UC4 找不到早餐該筆，無法進行編輯", "先跳過");
      return;
    }

    // Step 2: hover 該列讓 pencil icon 出現，點編輯
    const row = rows.first();
    await row.scrollIntoViewIfNeeded();
    await row.hover();
    await shot(page, 4, 2);

    // aria-label 是 `編輯 ${title}` — title 對應 description
    const editBtn = row.getByRole("button", { name: /^編輯 / });
    await softCheck(4, "編輯 icon 按鈕存在", "CRITICAL", async () => {
      await expect(editBtn).toHaveCount(1, { timeout: 5_000 });
    });
    // 直接 click（就算 opacity-0 md:group-hover 也可以 dispatchEvent；hover 過了就 opacity-100）
    await editBtn.first().click({ force: true });

    // Step 3: 編輯 dialog 開啟
    await softCheck(4, "編輯 dialog 打開", "CRITICAL", async () => {
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByRole("dialog").getByText("編輯帳目", { exact: true })
      ).toBeVisible();
    });
    const dialog = page.getByRole("dialog");
    await shot(page, 4, 3);

    // Step 4: 拉到底找「歸屬專案標籤」欄位
    const tagInput = dialog.getByLabel(/歸屬專案標籤/);
    await softCheck(4, "「歸屬專案標籤」欄位可見", "HIGH", async () => {
      await expect(tagInput).toBeVisible({ timeout: 3_000 });
    });
    await tagInput.scrollIntoViewIfNeeded();

    // Step 5: 檢查是否有 datalist 自動完成（不強制存在）
    const hasDatalist = await dialog.locator("datalist").count();
    console.log(`    Datalist 建議清單數量: ${hasDatalist}`);
    if (hasDatalist === 0) {
      console.log("    Datalist 不存在（可能沒有既有 project_tag）— 只能手打");
    }

    await tagInput.fill("太太醫療");
    await shot(page, 4, 4);

    // Step 6: 儲存
    const saveBtn = dialog.getByRole("button", { name: /^儲存$|儲存中/ });
    await softCheck(4, "儲存按鈕可見可按", "CRITICAL", async () => {
      await expect(saveBtn).toBeEnabled({ timeout: 3_000 });
    });
    await saveBtn.click();

    // Step 7: dialog 關閉
    await softCheck(4, "儲存後 dialog 關閉", "HIGH", async () => {
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 8_000 });
    });
    await shot(page, 4, 5);

    // Step 8: 回到列表這筆該顯示更新後的專案標籤
    // 專案標籤在 row 上是否有可讀展示？— 檢查 row innerText 是否含「太太醫療」
    // 給 revalidate + client refresh 一點時間
    await page.waitForTimeout(1200);
    await page.waitForLoadState("networkidle").catch(() => {});
    const updatedRow = page.locator("ul > li").filter({ hasText: "早餐" }).first();
    const updatedText = (await updatedRow.innerText().catch(() => "")).replace(/\s+/g, " ");
    console.log(`    更新後列文字: ${updatedText.slice(0, 300)}`);

    if (!/太太醫療/.test(updatedText)) {
      recordAnomaly(
        4,
        "HIGH",
        "貼上「太太醫療」後列表未顯示該標籤",
        `期望在 row innerText 看到「太太醫療」，實際：${updatedText.slice(0, 200)}`
      );
    } else {
      console.log("    列表已顯示「太太醫療」— 更新可見");
    }
    await shot(page, 4, 6);

    // Step 9 (cleanup courtesy): 撤除標籤讓 dev DB 保持乾淨
    // 為了不影響其他測試 / 手動 QA，這裡不真的還原 — 讓 orchestrator / 開發者
    // 檢視後自行決定。
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════
  test.afterAll(async () => {
    console.log("\n══════════════ Anomaly Summary ══════════════");
    console.log(`Total: ${anomalies.length}`);
    const bySev: Record<Severity, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    for (const a of anomalies) bySev[a.severity]++;
    console.log(
      `CRITICAL=${bySev.CRITICAL}  HIGH=${bySev.HIGH}  MEDIUM=${bySev.MEDIUM}  LOW=${bySev.LOW}`
    );
    for (const a of anomalies) {
      console.log(`  [${a.severity}] UC${a.uc}: ${a.title} — ${a.detail}`);
    }
  });
});
