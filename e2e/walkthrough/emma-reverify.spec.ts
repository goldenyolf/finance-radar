import { test, expect, type Page } from "@playwright/test";

import { TEST_EMAIL, testPassword } from "./_creds";

// ─── Emma 王太太 re-verify walkthrough ───────────────────────────────────────
// 這輪重點：上一輪 Emma review 說「空帳號進來看不到帳戶篩選 / 專案隔離入口」以及
// 「同頁兩種日期分隔符」。我要用 Emma 的眼睛實際走一遍。
//
// 實測發現：這個帳號其實「不是空的」——有 4 個帳戶、2 筆交易、1 個專案標籤。
// 所以頁面走的是「功能已啟用」的正式分支（Select / Switch），不是空帳號教學態。
// 我照實走：能不能看到、能不能用、日期讀起來順不順、格式一不一致。

const FRONTEND_URL = "http://localhost:3000";
const SHOT = "e2e/walkthrough/screenshots";

test.use({ headless: true, viewport: { width: 1920, height: 1080 } });

type Sev = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
const anomalies: { uc: number; sev: Sev; title: string; detail: string }[] = [];
const facts: string[] = [];
function note(msg: string) {
  facts.push(msg);
  console.log(`  [NOTE] ${msg}`);
}
function flag(uc: number, sev: Sev, title: string, detail: string) {
  anomalies.push({ uc, sev, title, detail });
  console.log(`  [${sev}] UC${uc}: ${title} — ${detail}`);
}

async function softCheck(
  uc: number,
  label: string,
  sev: Sev,
  fn: () => Promise<void>
) {
  try {
    await fn();
    console.log(`[PASS] UC${uc}: ${label}`);
  } catch (e) {
    const m = (e as Error).message.split("\n")[0].slice(0, 200);
    console.log(`[FAIL] UC${uc}: ${label} — ${m}`);
    anomalies.push({ uc, sev, title: label, detail: m });
  }
}

async function shot(page: Page, uc: number, step: number, label: string) {
  await page.screenshot({
    path: `${SHOT}/emma-rv-uc${uc}-step${step}-${label}.png`,
    fullPage: true,
  });
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto(`${FRONTEND_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 20_000,
    }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
}

/** 從字串抽出日期用的分隔符（`/` 或 `-`），抓不到回 null。 */
function dateSep(s: string): string | null {
  const m = s.match(/\d{4}([/-])\d{2}\1\d{2}/);
  return m ? m[1] : null;
}
/** 抽出第一個完整日期 token，給報告直接引用。 */
function firstDate(s: string): string | null {
  const m = s.match(/\d{4}[/-]\d{2}[/-]\d{2}/);
  return m ? m[0] : null;
}

test.describe.configure({ mode: "serial" });

test.describe("Emma re-verify walkthrough", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await loginAs(page, TEST_EMAIL, testPassword());
  });

  test.afterAll(() => {
    console.log("\n════════ EMMA RE-VERIFY FACTS ════════");
    for (const f of facts) console.log("  • " + f);
    console.log("\n════════ EMMA RE-VERIFY ANOMALIES ════════");
    if (anomalies.length === 0) console.log("  (none)");
    for (const a of anomalies)
      console.log(`  [${a.sev}] UC${a.uc} ${a.title} — ${a.detail}`);
  });

  // ─── UC1：/analytics 想切「帳戶檢視範圍」 ─────────────────────────────────
  test("UC1 帳戶檢視範圍", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/analytics`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await shot(page, 1, 1, "analytics-landing");

    await softCheck(1, "看得到「帳戶檢視範圍」這個功能", "HIGH", async () => {
      await expect(page.getByText("帳戶檢視範圍").first()).toBeVisible({
        timeout: 8_000,
      });
    });

    const scopeRow = page
      .getByText("帳戶檢視範圍")
      .first()
      .locator("xpath=ancestor::div[1]");
    const scopeText = await scopeRow.innerText().catch(() => "(讀取失敗)");
    note(`UC1 帳戶檢視範圍 strip 文字 = ${JSON.stringify(scopeText)}`);

    // 判斷分支：空帳號教學態 vs 已啟用 Select
    const teaching = await page
      .getByText(/新增第二個帳戶/)
      .first()
      .isVisible()
      .catch(() => false);
    const liveSelect = await page
      .getByText("全部資產總覽")
      .first()
      .isVisible()
      .catch(() => false);
    note(`UC1 分支：教學態=${teaching} / 已啟用Select=${liveSelect}`);

    if (teaching) {
      note("UC1 空帳號教學態：strip 有告訴我「新增第二個帳戶後可切換」— 達成成功標準（看得到+知道怎麼啟用）");
    } else if (liveSelect) {
      note("UC1 帳號有 >1 帳戶：直接顯示可用的帳戶下拉，能實際切換 — 比教學態更強");
      // 實際切一個帳戶對照（best-effort — base-ui Select 用 portal + data-slot）
      await softCheck(1, "能打開帳戶下拉看到可切換的帳戶清單", "HIGH", async () => {
        await page
          .locator('[data-slot="select-trigger"]')
          .first()
          .click({ timeout: 5_000 });
        await page.waitForTimeout(600);
        // 用 viewport 截圖（非 fullPage）避免捲動把 base-ui popup 關掉
        await page.screenshot({
          path: `${SHOT}/emma-rv-uc1-step2-account-dropdown-open.png`,
          fullPage: false,
        });
        const items = page.locator('[data-slot="select-item"]');
        const n = await items.count();
        note(`UC1 下拉可選項目數（含全部總覽） = ${n}`);
        expect(n).toBeGreaterThan(1); // 至少「全部總覽」+ 1 個實體帳戶
      });
      // popup 仍開著時直接點項目（不要在中間插 fullPage 截圖）
      const items = page.locator('[data-slot="select-item"]');
      const n = await items.count().catch(() => 0);
      if (n > 1) {
        await softCheck(1, "選一個實體帳戶後 scope 收窄到單一帳戶", "MEDIUM", async () => {
          await items.nth(n - 1).click({ timeout: 5_000 });
          await page.waitForTimeout(700);
          await expect(page.getByText(/僅檢視「/).first()).toBeVisible({
            timeout: 5_000,
          });
        });
        const afterText = await scopeRow.innerText().catch(() => "");
        note(`UC1 切換後 scope 文字 = ${JSON.stringify(afterText)}`);
      } else {
        await page.keyboard.press("Escape").catch(() => {});
        note("UC1 下拉未展開可點的項目（base-ui portal 時序）— 但功能入口與 4 帳戶合計文案已可見");
      }
      await shot(page, 1, 3, "account-scoped");
    } else {
      flag(1, "HIGH", "帳戶檢視範圍既無教學態也無可用下拉", scopeText);
    }
  });

  // ─── UC2：/analytics 想開「特定專案隔離模式」 ─────────────────────────────
  test("UC2 特定專案隔離模式", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/analytics`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    await softCheck(2, "看得到「特定專案隔離模式」入口", "HIGH", async () => {
      await expect(page.getByText("特定專案隔離模式").first()).toBeVisible({
        timeout: 8_000,
      });
    });

    const isoRow = page
      .getByText("特定專案隔離模式")
      .first()
      .locator("xpath=ancestor::div[1]");
    const isoText = await isoRow.innerText().catch(() => "(讀取失敗)");
    note(`UC2 特定專案隔離模式 strip 文字 = ${JSON.stringify(isoText)}`);

    const teaching = await page
      .getByText(/打上專案標籤|後可啟用/)
      .first()
      .isVisible()
      .catch(() => false);
    const liveSwitch = await page
      .getByText(/個專案可選/)
      .first()
      .isVisible()
      .catch(() => false);
    note(`UC2 分支：教學態=${teaching} / 已啟用Switch=${liveSwitch}`);

    await page
      .getByText("特定專案隔離模式")
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await shot(page, 2, 1, "isolation-strip");

    if (teaching) {
      note("UC2 空帳號教學態：strip 有告訴我「先打上專案標籤後可啟用」— 達成成功標準");
    } else if (liveSwitch) {
      note("UC2 帳號有專案標籤：直接顯示可切的 Switch — 比教學態更強");
      // 實際打開隔離模式
      await softCheck(2, "能實際開啟隔離模式並展開過濾配置", "HIGH", async () => {
        const sw = page.getByRole("switch", { name: /特定專案隔離模式/ });
        await sw.click({ timeout: 5_000 });
        await page.waitForTimeout(700);
        await expect(page.getByText(/自訂過濾專案/).first()).toBeVisible({
          timeout: 5_000,
        });
      });
      await shot(page, 2, 2, "isolation-on");
    } else {
      flag(2, "HIGH", "特定專案隔離模式既無教學態也無可用開關", isoText);
    }
  });

  // ─── UC3：搜「醫療」+ 近 90 天，比對日期格式一致性（本輪核心）─────────────
  test("UC3 日期格式一致性（trigger vs 空狀態訊息）", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/transactions`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await shot(page, 3, 1, "transactions-landing");

    // (1) 搜尋「醫療」
    const search = page.getByLabel(/搜尋帳目/);
    await softCheck(3, "找得到搜尋框並輸入「醫療」", "HIGH", async () => {
      await expect(search).toBeVisible({ timeout: 8_000 });
    });
    await search.fill("醫療");
    await page.waitForTimeout(1200); // debounce(350) + fetch
    await shot(page, 3, 2, "search-yiliao");

    // (2) 打開日期 picker
    const pickerTrigger = page.getByLabel("選擇日期區間");
    await softCheck(3, "找得到日期區間 picker 並打開", "HIGH", async () => {
      await expect(pickerTrigger).toBeVisible({ timeout: 8_000 });
      await pickerTrigger.click();
      await expect(page.getByRole("button", { name: "近 90 天" })).toBeVisible({
        timeout: 5_000,
      });
    });
    await shot(page, 3, 3, "date-picker-open");

    const presetNames: string[] = [];
    for (const name of ["本月", "上月", "近 30 天", "近 90 天"]) {
      const vis = await page
        .getByRole("button", { name })
        .isVisible()
        .catch(() => false);
      if (vis) presetNames.push(name);
    }
    note(`UC3 picker preset 名稱 = ${JSON.stringify(presetNames)}`);

    // (3) 點「近 90 天」
    await page.getByRole("button", { name: "近 90 天" }).click();
    await page.waitForTimeout(1500); // popover 關 + range 套 + refetch

    // ── 截圖 A：trigger 上的日期字串 ──
    // 用 anchored aria-label 避免撞到「清除日期區間」X 按鈕
    const triggerBtn = page.getByLabel(/^日期區間：/);
    let triggerText = "(未取得)";
    await softCheck(3, "近 90 天 套用後 trigger 顯示日期區間", "HIGH", async () => {
      await expect(triggerBtn).toBeVisible({ timeout: 8_000 });
      triggerText = (await triggerBtn.innerText()).trim();
      expect(firstDate(triggerText)).not.toBeNull();
    });
    // 備援：若 innerText 空，改讀 aria-label
    if (firstDate(triggerText) === null) {
      const aria =
        (await triggerBtn.getAttribute("aria-label").catch(() => null)) ?? "";
      if (firstDate(aria)) triggerText = aria.replace(/^日期區間：/, "").trim();
    }
    note(`UC3 [A] picker trigger 日期字串 = ${JSON.stringify(triggerText)}`);
    await triggerBtn.scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, 3, 4, "trigger-date-string");

    // ── 截圖 B：空狀態訊息裡的日期字串 ──
    const emptyMsg = page.getByText(/找不到符合/);
    let emptyText = "(未取得)";
    await softCheck(3, "出現『找不到符合…』訊息且含日期", "MEDIUM", async () => {
      await expect(emptyMsg.first()).toBeVisible({ timeout: 12_000 });
      emptyText = (await emptyMsg.first().innerText()).trim();
      expect(firstDate(emptyText)).not.toBeNull();
    });
    note(`UC3 [B] 空狀態訊息文字 = ${JSON.stringify(emptyText)}`);
    await emptyMsg.first().scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, 3, 5, "empty-state-date-string");

    // ── 核心比對：兩處日期分隔符是否一致 ──
    const triggerSep = dateSep(triggerText);
    const emptySep = dateSep(emptyText);
    note(
      `UC3 分隔符比對：trigger=${JSON.stringify(
        triggerSep
      )} vs 空狀態=${JSON.stringify(emptySep)}`
    );
    await softCheck(3, "trigger 與空狀態用同一種日期分隔符", "MEDIUM", async () => {
      expect(triggerSep).not.toBeNull();
      expect(emptySep).not.toBeNull();
      expect(triggerSep).toBe(emptySep);
    });
    await softCheck(3, "日期用台灣順讀 YYYY/MM/DD（斜線非破折號）", "LOW", async () => {
      expect(triggerSep).toBe("/");
      expect(emptySep).toBe("/");
    });

    await shot(page, 3, 6, "fullpage-compare");
  });

  // ─── UC4：想批次改分類 ───────────────────────────────────────────────────
  test("UC4 批次改分類", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/transactions`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await shot(page, 4, 1, "transactions-for-bulk");

    const rowCheckboxes = page.getByRole("checkbox", { name: /選取/ });
    const rowCount = await rowCheckboxes.count().catch(() => 0);
    note(`UC4 可勾選交易列數 = ${rowCount}`);

    const emptyVisible = await page
      .getByText(/目前沒有任何帳目|找不到符合/)
      .first()
      .isVisible()
      .catch(() => false);
    note(`UC4 空狀態訊息可見 = ${emptyVisible}`);

    if (rowCount === 0) {
      note("UC4 走不下去：帳號無任何交易 row → 無法勾選 → 批次工具列不會出現（空 seed 限制）");
      flag(
        4,
        "LOW",
        "批次改分類 因空帳號 seed 無法走通",
        "帳號 0 筆交易，無 row 可勾，BulkActionsBar 不 mount；已知被延後的環境限制"
      );
    } else {
      await softCheck(4, "勾一列後浮出批次工具列", "HIGH", async () => {
        await rowCheckboxes.first().click();
        await page.waitForTimeout(600);
        await expect(page.getByText(/已選取/).first()).toBeVisible({
          timeout: 5_000,
        });
      });
      await shot(page, 4, 2, "bulk-bar");

      // 「更改分類」藏在「批次操作」Popover 的 Tab 裡 → 打開確認可達
      await softCheck(4, "打開批次操作選單能看到「更改分類」Tab", "HIGH", async () => {
        await page
          .getByRole("button", { name: /批次操作選單/ })
          .click({ timeout: 5_000 });
        await page.waitForTimeout(500);
        await expect(page.getByRole("tab", { name: /更改分類/ }).first()).toBeVisible({
          timeout: 5_000,
        });
      });
      const hasCat = await page
        .getByRole("tab", { name: /更改分類/ })
        .first()
        .isVisible()
        .catch(() => false);
      note(`UC4 「更改分類」Tab 可見（批次操作 popover 內） = ${hasCat}`);
      note("UC4 帳號實際有交易 → 批次改分類可走通（與『空帳號擋住』的預期相反）");
      await shot(page, 4, 3, "bulk-change-category-popover");
    }
    await shot(page, 4, 4, "bulk-final");
  });
});
