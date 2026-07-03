import { test, expect, type Page } from "@playwright/test";

import { TEST_EMAIL, testPassword } from "./_creds";

const FRONTEND_URL = "http://localhost:3000";
const SHOT = "e2e/walkthrough/screenshots"; // 檔名前綴一律 ken-rv-

test.use({ headless: true, viewport: { width: 1920, height: 1080 } });

type Sev = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
const anomalies: { uc: number; sev: Sev; title: string; detail: string }[] = [];

// 每輪跑產一個唯一 marker，讓「我這次記的那筆早餐」在重跑後仍能被精準定位。
// 分類仍由「早餐」關鍵字驅動（marker 只是 test 簿記，不影響 classifyByKeyword）。
const RUN = String(Date.now()).slice(-5);
const DESC = `早餐 #${RUN}`;
const TAG = "太太醫療";

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
    path: `${SHOT}/ken-rv-uc${uc}-step${step}-${label}.png`,
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
  await page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => {});
}

async function waitForDashboardReady(page: Page, timeoutMs = 30_000) {
  try {
    await page
      .getByRole("heading", { name: /歡迎回來/ })
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
  } catch {}
}

async function gotoTransactions(page: Page) {
  // 忠於 persona：先試左側 nav「明細」；失敗再直接 goto。
  let navigated = false;
  try {
    const navLink = page.getByRole("link", { name: "明細" }).first();
    await navLink.waitFor({ state: "visible", timeout: 4_000 });
    await navLink.click();
    await page.waitForURL(/\/transactions/, { timeout: 8_000 });
    navigated = true;
  } catch {
    // ignore, fall back
  }
  if (!navigated) {
    await page.goto(`${FRONTEND_URL}/transactions`, {
      waitUntil: "domcontentloaded",
    });
  }
  // 等搜尋框出現，代表 TransactionsView 已 hydrate
  await page
    .getByRole("textbox", { name: /搜尋帳目/ })
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("Ken re-verify walkthrough", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await loginAs(page, TEST_EMAIL, testPassword());
  });

  test.afterAll(async () => {
    console.log("\n================ ANOMALY DUMP ================");
    console.log(JSON.stringify(anomalies, null, 2));
    console.log(`RUN marker=${RUN}  DESC="${DESC}"`);
    console.log("==============================================\n");
  });

  // ─────────────────────────────────────────────────────────────
  // UC1：早上 8:00 掃戰情室 — 3 秒判斷本月現金流健康度
  // 成功標準：首頁上方有一組「本月」大字 KPI（總支出/總收入/儲蓄率）
  // ─────────────────────────────────────────────────────────────
  test("UC1: 早上掃戰情室", async ({ page }) => {
    await waitForDashboardReady(page);
    await shot(page, 1, 1, "dashboard-landing");

    const headline = page.locator('[aria-label="本月核心數據"]');

    await softCheck(1, "首頁存在『本月核心數據』大字報區塊", "HIGH", async () => {
      await expect(headline).toBeVisible({ timeout: 10_000 });
    });

    await softCheck(1, "大字報含『本月總支出』欄位", "HIGH", async () => {
      await expect(headline).toContainText("本月總支出");
    });
    await softCheck(1, "大字報含『本月總收入』欄位", "HIGH", async () => {
      await expect(headline).toContainText("本月總收入");
    });
    await softCheck(1, "大字報含『儲蓄率』欄位", "HIGH", async () => {
      await expect(headline).toContainText("儲蓄率");
    });

    // 大字報必須在板塊卡之前（在頁面上方，一眼看到）— 用 heading 到 headline 的
    // DOM 位置粗略判斷「在戰情室板塊之上」。
    await softCheck(1, "大字報位於首屏（heading 之後、板塊區之前）", "LOW", async () => {
      const box = await headline.boundingBox();
      expect(box).not.toBeNull();
      // 首屏 1080 高度內就看得到即算達標
      expect(box!.y).toBeLessThan(900);
    });

    await shot(page, 1, 2, "month-headline-cards");
  });

  // ─────────────────────────────────────────────────────────────
  // UC2：中午 12:30 記一筆 88 元早餐（現金）
  // 成功標準：dialog 一開，付款方式 pill 就跟預設扣款帳戶同步 highlight
  // ─────────────────────────────────────────────────────────────
  test("UC2: 快速記帳 88 元早餐", async ({ page }) => {
    await waitForDashboardReady(page);

    // 桌面版頁首 pill：文字含「快速記帳」（mobile FAB 文字是「記帳」不會誤中）
    const addBtn = page.locator('button:has-text("快速記帳")').first();
    await softCheck(2, "頁首『快速記帳』pill 可見可點", "CRITICAL", async () => {
      await expect(addBtn).toBeVisible({ timeout: 10_000 });
      await addBtn.click();
    });

    const dialog = page.getByRole("dialog");
    await softCheck(2, "快速記帳 dialog 成功開啟", "CRITICAL", async () => {
      await expect(dialog.getByText("快速記帳", { exact: true })).toBeVisible({
        timeout: 8_000,
      });
    });
    await shot(page, 2, 1, "dialog-opened-untouched");

    // === 關鍵觀察：在還沒點任何付款方式前，量測三個 pill 的 aria-checked ===
    const cashPill = dialog.getByRole("radio", { name: "現金" });
    const cardPill = dialog.getByRole("radio", { name: "刷卡" });
    const transferPill = dialog.getByRole("radio", { name: "轉帳" });

    let cashChecked = "unknown";
    let cardChecked = "unknown";
    let transferChecked = "unknown";
    let acctLabel = "unknown";
    try {
      cashChecked = (await cashPill.getAttribute("aria-checked")) ?? "null";
      cardChecked = (await cardPill.getAttribute("aria-checked")) ?? "null";
      transferChecked =
        (await transferPill.getAttribute("aria-checked")) ?? "null";
      // 扣款帳戶 trigger 顯示的帳戶名（Label htmlFor 綁 Select trigger）
      acctLabel =
        (await dialog
          .getByLabel("扣款帳戶")
          .textContent()
          .catch(() => "n/a")) ?? "n/a";
    } catch {
      /* ignore */
    }
    const activePill =
      cashChecked === "true"
        ? "現金"
        : cardChecked === "true"
          ? "刷卡"
          : transferChecked === "true"
            ? "轉帳"
            : "（全灰）";
    console.log(
      `[OBSERVE] UC2 開啟即狀態 現金=${cashChecked} 刷卡=${cardChecked} 轉帳=${transferChecked} / 預設扣款帳戶≈"${acctLabel?.trim()}" → active pill="${activePill}"`
    );

    // 核心 assertion（K-A2.1 回歸驗證）：開啟當下至少一個付款 pill 是 active，
    // 不是全灰要 user 再點一次。
    await softCheck(
      2,
      "開啟當下付款方式 pill 已與預設扣款帳戶同步 highlight（非全灰）",
      "HIGH",
      async () => {
        const anyChecked =
          cashChecked === "true" ||
          cardChecked === "true" ||
          transferChecked === "true";
        expect(anyChecked, `pill 狀態 現金=${cashChecked} 刷卡=${cardChecked} 轉帳=${transferChecked}`).toBe(true);
      }
    );

    // Ken 付的是現金早餐 — 觀察 dialog 預設是否直接落在現金錢包 + 現金 pill。
    // 這是「產品預設帳戶選擇」問題，不是 sync bug（sync 上面已驗證通過）。
    // 若預設落在銀行帳戶/轉帳，Ken 每天記現金餐都要多切一次 → 記 LOW。
    await softCheck(2, "（觀察）現金早餐情境：dialog 預設是否落在現金/現金 pill", "LOW", async () => {
      expect(
        activePill,
        `預設 active pill=${activePill}，預設帳戶=${acctLabel?.trim()}`
      ).toBe("現金");
    });

    // 填單：項目名稱 + 金額（type 預設就是「支出」）
    await softCheck(2, "填入項目名稱與金額並送出", "CRITICAL", async () => {
      await dialog.getByLabel("項目名稱").fill(DESC);
      await dialog.getByLabel("金額（TWD）").fill("88");
      await shot(page, 2, 2, "form-filled");
      await dialog.getByRole("button", { name: "新增交易" }).click();
    });

    // 送出後 dialog 關閉 + toast
    await softCheck(2, "送出後 dialog 關閉（交易已建立）", "HIGH", async () => {
      await expect(dialog.getByText("快速記帳", { exact: true })).toBeHidden({
        timeout: 10_000,
      });
    });
    await page
      .getByText("已新增交易", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 6_000 })
      .catch(() => {});
    await shot(page, 2, 3, "after-submit");
  });

  // ─────────────────────────────────────────────────────────────
  // UC3：下班 18:00 去 /transactions 查剛剛那筆早餐
  // 成功標準：這筆早餐分類 badge = 「餐飲食品」，不是灰灰的「其他」
  // ─────────────────────────────────────────────────────────────
  test("UC3: 明細查早餐分類", async ({ page }) => {
    await waitForDashboardReady(page);
    await gotoTransactions(page);
    await shot(page, 3, 1, "transactions-landing");

    // 搜尋「早餐」
    const search = page.getByRole("textbox", { name: /搜尋帳目/ }).first();
    await softCheck(3, "搜尋框可輸入『早餐』", "HIGH", async () => {
      await search.click();
      await search.fill("早餐");
    });

    // 等我這筆（DESC 帶唯一 marker）出現
    const row = page.locator("li").filter({ hasText: DESC }).first();
    await softCheck(3, "搜尋結果找得到剛記的那筆早餐（−$88）", "CRITICAL", async () => {
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText("88");
    });
    await shot(page, 3, 2, "search-early-result");

    // 核心 assertion（K-A3.1 回歸驗證）：分類 = 餐飲食品，不是其他
    await softCheck(3, "早餐分類 badge = 『餐飲食品』（自動歸類生效）", "HIGH", async () => {
      await expect(row).toContainText("餐飲食品");
    });
    await softCheck(3, "早餐分類『不是』灰色其他", "HIGH", async () => {
      const txt = (await row.textContent()) ?? "";
      // 若同時含餐飲食品才是對的；含「其他」而不含「餐飲食品」= 退化
      expect(
        txt.includes("餐飲食品"),
        `row text="${txt.replace(/\s+/g, " ").trim().slice(0, 160)}"`
      ).toBe(true);
    });
    await shot(page, 3, 3, "category-badge-closeup");
  });

  // ─────────────────────────────────────────────────────────────
  // UC4：晚上 21:00 幫那筆早餐貼專案標籤「太太醫療」
  // 成功標準：儲存後回列表，那一列直接看得到「太太醫療」🏷️ chip
  // ─────────────────────────────────────────────────────────────
  test("UC4: 幫早餐貼專案標籤", async ({ page }) => {
    await waitForDashboardReady(page);
    await gotoTransactions(page);

    // 不觸發搜尋 refetch：剛記的早餐是今天最新一筆，已在初始清單最上方。
    // （避免 debounce server fetch 完成時 re-render 把剛開的編輯 dialog 拆掉 —
    //  見下方 A4.2 觀察。）Ken 打開明細，早餐就在最上面。
    const row = page.locator("li").filter({ hasText: DESC }).first();
    await softCheck(4, "定位到要貼標籤的早餐列（初始清單最上方）", "CRITICAL", async () => {
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.scrollIntoViewIfNeeded();
    });
    await page.waitForTimeout(400); // 讓任何初始 reconcile 收斂

    // hover 該列 → 點鉛筆（aria-label=編輯 <DESC>）
    await softCheck(4, "hover 該列露出鉛筆並開啟編輯 dialog", "HIGH", async () => {
      await row.hover();
      const pencil = row.getByRole("button", { name: `編輯 ${DESC}` });
      await pencil.click();
    });

    const editDialog = page.getByRole("dialog");
    await softCheck(4, "編輯帳目 dialog 開啟", "HIGH", async () => {
      await expect(
        editDialog.getByText("編輯帳目", { exact: true })
      ).toBeVisible({ timeout: 8_000 });
    });
    await shot(page, 4, 1, "edit-dialog-opened");

    // 拉到底「🏷️ 歸屬專案標籤」欄位 → 打「太太醫療」
    await softCheck(4, "在專案標籤欄位輸入『太太醫療』並儲存", "CRITICAL", async () => {
      const tagInput = editDialog.getByPlaceholder(
        "選填，例如：太太醫療、新居家電"
      );
      // 用 fill（focus 寫值）而非 click — dialog overlay 會攔 pointer，
      // click 的 actionability 會卡；fill 走 focus + 自動重新解析 locator。
      await tagInput.fill(TAG, { timeout: 20_000 });
      await shot(page, 4, 2, "tag-filled");
      await editDialog
        .getByRole("button", { name: "儲存" })
        .click({ timeout: 15_000 });
    });

    await softCheck(4, "儲存後 dialog 關閉", "MEDIUM", async () => {
      await expect(
        editDialog.getByText("編輯帳目", { exact: true })
      ).toBeHidden({ timeout: 10_000 });
    });
    await page
      .getByText("已更新帳目", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 6_000 })
      .catch(() => {});

    // 核心 assertion（K-A4.1 回歸驗證）：回到列表，MY 這列直接看得到 太太醫療 chip
    const rowAfter = page.locator("li").filter({ hasText: DESC }).first();
    await softCheck(4, "回列表後該列直接顯示『太太醫療』🏷️ chip（免再開 dialog）", "HIGH", async () => {
      await expect(rowAfter).toBeVisible({ timeout: 10_000 });
      await expect(rowAfter).toContainText(TAG);
    });
    await shot(page, 4, 3, "tag-chip-visible-in-list");
  });
});
