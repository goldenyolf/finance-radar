import { test, expect, type Page } from '@playwright/test'

import { TEST_EMAIL, testPassword } from './_creds'

// ─── Persona-specific config ─────────────────────────────────────────────────
const PERSONA = 'emma'
const FRONTEND_URL = 'http://localhost:3000'
const LOGIN_EMAIL = TEST_EMAIL
const SCREENSHOT_DIR = 'e2e/walkthrough/screenshots'

// ─── Browser config (pinned in-spec, not via CLI) ─────────────────────────────
test.use({
  headless: true,
  viewport: { width: 1920, height: 1080 },
})

// 全走 4 個 UC，避免某 UC 內部超時把 UC4 跳過
test.setTimeout(180_000)

// ─── Anomaly capture ─────────────────────────────────────────────────────────
type Anomaly = {
  uc: number
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  title: string
  detail: string
}
const anomalies: Anomaly[] = []

async function softCheck(uc: number, label: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`  [PASS] UC${uc} ${label}`)
  } catch (e) {
    const detail = (e as Error).message.split('\n')[0]
    console.log(`  [FAIL] UC${uc} ${label} — ${detail}`)
    anomalies.push({ uc, severity: 'HIGH', title: label, detail })
  }
}

function recordAnomaly(uc: number, severity: Anomaly['severity'], title: string, detail: string) {
  anomalies.push({ uc, severity, title, detail })
  console.log(`  [${severity}] UC${uc}: ${title} — ${detail}`)
}

async function shot(page: Page, uc: number, step: number, label = '') {
  const suffix = label ? `-${label}` : ''
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${PERSONA}-uc${uc}-step${step}${suffix}.png`,
    fullPage: true,
  })
}

// ─── Login ───────────────────────────────────────────────────────────────────
async function loginAs(page: Page) {
  await page.goto(`${FRONTEND_URL}/login`)
  await page.fill('input[name=email]', LOGIN_EMAIL)
  await page.fill('input[name=password]', testPassword())
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 }),
    page.click('button[type=submit]'),
  ])
  // Give RSC a moment to hydrate
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Parse "$1,234" / "-$1,234" / "1,234.56" style numeric strings to number.
 * Returns NaN if no digits found.
 */
function parseMoney(s: string | null | undefined): number {
  if (!s) return NaN
  const cleaned = s.replace(/[^0-9.\-]/g, '')
  if (!cleaned) return NaN
  return Number(cleaned)
}

/** Take a compact "text state" fingerprint of the analytics page. Used to
 * detect whether all charts respond to account/isolation changes. */
async function analyticsFingerprint(page: Page): Promise<string> {
  // Grab visible key numbers we can identify by text pattern (rough but enough
  // to detect "did the page redraw at all")
  const bodyText = (await page.locator('main').innerText().catch(() => '')) || ''
  // extract first few $-prefixed / large-number tokens
  const tokens = bodyText.match(/\$?[\d,]{3,}/g) ?? []
  return tokens.slice(0, 8).join('|')
}

async function switchAccount(page: Page, accountLabel: string): Promise<boolean> {
  // The account trigger is inside the "帳戶檢視範圍" strip. We click the first
  // combobox in that strip and pick an item.
  const strip = page.locator('text=帳戶檢視範圍').first()
  const stripBox = strip.locator('xpath=ancestor::div[1]')
  const trigger = stripBox.getByRole('combobox').first()
  if (!(await trigger.isVisible().catch(() => false))) return false
  await trigger.click()
  const opt = page.getByRole('option', { name: new RegExp(accountLabel) }).first()
  if (!(await opt.isVisible().catch(() => false))) {
    await page.keyboard.press('Escape')
    return false
  }
  await opt.click()
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  return true
}

test.describe.configure({ mode: 'serial' })

test.describe(`${PERSONA} persona walkthrough — Emma 王太太`, () => {
  test.beforeAll(async () => {
    console.log('=== Emma 王太太 (40 歲家庭 CFO / 兼職會計) 開始月底對帳 ===')
  })

  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  // ────────────────────────────────────────────────────────────────────────
  // UC1: /analytics — 帳戶篩選是否讓「所有圖表」跟著切
  // ────────────────────────────────────────────────────────────────────────
  test('UC1: /analytics 帳戶篩選切換', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/analytics`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await shot(page, 1, 1, 'landing-all-accounts')

    // 帳戶檢視範圍 strip 應該存在（>1 個帳戶時）
    const stripLabel = page.locator('text=帳戶檢視範圍')
    const stripPresent = await stripLabel.first().isVisible().catch(() => false)
    if (!stripPresent) {
      recordAnomaly(
        1,
        'MEDIUM',
        '「帳戶檢視範圍」slim strip 不可見',
        'Emma 只有一個帳戶或 UI 沒渲染這條 — 少了頁面全域切換入口'
      )
    }

    // 月度大字必須顯示（本月總支出 / 本月總收入）
    await softCheck(1, '月度大字「本月總支出」顯示', async () => {
      await expect(page.getByText('本月總支出').first()).toBeVisible({ timeout: 10_000 })
    })
    await softCheck(1, '月度大字「本月總收入」顯示', async () => {
      await expect(page.getByText('本月總收入').first()).toBeVisible()
    })

    // 圓餅、Sankey、財務彈性、跨月趨勢 — 用區塊標題 / lucide title 作為 anchor
    const chartAnchors = [
      { label: '收支現金流', hint: 'Sankey' },
      { label: '財務彈性', hint: '財務彈性 KPI' },
      { label: '跨月', hint: '跨月趨勢' },
    ]
    for (const { label } of chartAnchors) {
      const visible = await page.getByText(new RegExp(label)).first().isVisible().catch(() => false)
      if (!visible) {
        recordAnomaly(1, 'LOW', `區塊「${label}」未在畫面上見到`, '可能捲軸未到 / 名稱不同')
      }
    }

    // 記錄「全部資產總覽」狀態下的指紋
    const fpAll = await analyticsFingerprint(page)
    console.log(`  [fp:all] ${fpAll}`)
    await shot(page, 1, 2, 'fingerprint-all')

    // 若 strip 存在則嘗試切「家庭公庫」
    let switchedFamily = false
    if (stripPresent) {
      switchedFamily = await switchAccount(page, '家庭公庫')
      if (!switchedFamily) {
        recordAnomaly(
          1,
          'MEDIUM',
          '找不到「家庭公庫」帳戶選項',
          '可能 seed 資料 name 不同；或 SelectValue 沒展開'
        )
      }
    }
    if (switchedFamily) {
      await shot(page, 1, 3, 'switched-family')
      const fpFamily = await analyticsFingerprint(page)
      console.log(`  [fp:family] ${fpFamily}`)
      if (fpFamily === fpAll) {
        recordAnomaly(
          1,
          'CRITICAL',
          '切「家庭公庫」後圖表數字未變動',
          '全域帳戶篩選失效 — 圓餅/Sankey/彈性/趨勢與「全部資產總覽」完全相同，credibility 崩'
        )
      } else {
        console.log('  [OK] fingerprint changed when switching to 家庭公庫')
      }
    }

    // 切「隨身現金」/ 「cash」試試
    if (stripPresent) {
      const switchedCash = await switchAccount(page, '(隨身現金|現金錢包|Cash|cash)')
      if (switchedCash) {
        await shot(page, 1, 4, 'switched-cash')
        const fpCash = await analyticsFingerprint(page)
        console.log(`  [fp:cash] ${fpCash}`)
        if (fpCash === fpAll) {
          recordAnomaly(
            1,
            'CRITICAL',
            '切現金帳戶後圖表未跟隨變動',
            '同 UC1: 全域帳戶篩選對現金錢包 scope 沒作用'
          )
        }
      } else {
        recordAnomaly(1, 'LOW', '沒找到現金 / 錢包類帳戶', 'seed 沒建立或名稱不同')
      }
    }

    // 切回全部
    if (stripPresent) {
      await switchAccount(page, '全部資產總覽')
      await shot(page, 1, 5, 'back-to-all')
    }
  })

  // ────────────────────────────────────────────────────────────────────────
  // UC2: 特定專案隔離模式 ON/OFF
  // ────────────────────────────────────────────────────────────────────────
  test('UC2: 特定專案隔離模式 ON/OFF', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/analytics`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const isolateLabel = page.getByText('特定專案隔離模式').first()
    const isolateVisible = await isolateLabel.isVisible().catch(() => false)

    if (!isolateVisible) {
      recordAnomaly(
        2,
        'MEDIUM',
        '「特定專案隔離模式」slim 條沒出現',
        '該帳號可能沒有任何 project_tag 資料 — 條件性隱藏是預期行為，但 Emma 沒東西可測'
      )
      await shot(page, 2, 1, 'no-isolate-strip')
      return
    }
    await shot(page, 2, 1, 'isolate-strip-off')

    // 記錄 OFF 狀態圖表指紋
    const fpOff = await analyticsFingerprint(page)

    // 找到 switch 並打開
    const isolateStripBox = isolateLabel.locator('xpath=ancestor::label[1]/ancestor::div[1]/ancestor::div[1]')
    const toggle = page.getByLabel(/特定專案隔離模式/).first()
    const toggleVisible = await toggle.isVisible().catch(() => false)
    if (!toggleVisible) {
      recordAnomaly(2, 'HIGH', 'Switch aria-label 找不到', '無法用 assistive tech 操作隔離模式')
    }

    // toggle ON
    await toggle.click().catch(async () => {
      // fallback: click the label
      await isolateLabel.click()
    })
    await page.waitForTimeout(400) // give framer-motion time to animate
    await shot(page, 2, 2, 'isolate-on')

    // 驗證：Collapsible 是否自動展開（「自訂過濾專案」文字應該可見的 checkbox 面板）
    const panelHint = page.getByText('全部納入過濾').first()
    const panelOpen = await panelHint.isVisible().catch(() => false)
    if (!panelOpen) {
      recordAnomaly(
        2,
        'HIGH',
        'toggle ON 後配置面板未自動展開',
        '使用者無法看到「哪些 tag 要過濾」的選項，得再點一次 chevron；違反 spec.md 顯示策略 (3)'
      )
    }

    // 驗證：主圖指紋改變（因為部分交易被搬到歸檔區）
    const fpOn = await analyticsFingerprint(page)
    if (fpOn === fpOff) {
      recordAnomaly(
        2,
        'CRITICAL',
        'toggle ON 後主圖數字沒變',
        '這代表隔離語意反了 (OFF=過濾) 或 mainTransactions 篩選沒接上；或該用戶沒有任何 tagged transactions（HIGH 而非 CRITICAL）'
      )
    }

    // 驗證：歸檔區出現（找「歸檔」關鍵字或 line-through 樣式）
    const archiveHeadingVisible = await page
      .getByText(/歸檔|已隔離|已排除/)
      .first()
      .isVisible()
      .catch(() => false)
    if (!archiveHeadingVisible) {
      recordAnomaly(
        2,
        'HIGH',
        'ON 後沒看到「歸檔區」區塊',
        '過濾出的交易去哪了？Emma 無法信任 — 錢憑空消失'
      )
    }
    await shot(page, 2, 3, 'archive-region')

    // toggle OFF
    await toggle.click().catch(async () => {
      await isolateLabel.click()
    })
    await page.waitForTimeout(400)
    await shot(page, 2, 4, 'isolate-off-again')

    const fpOffAgain = await analyticsFingerprint(page)
    if (fpOffAgain !== fpOff) {
      recordAnomaly(
        2,
        'HIGH',
        'toggle OFF 後主圖沒回到原狀',
        '狀態沒清乾淨；ON/OFF 不對稱'
      )
    }
    const archiveGoneAfterOff = !(await page
      .getByText(/歸檔/)
      .first()
      .isVisible()
      .catch(() => false))
    if (!archiveGoneAfterOff) {
      recordAnomaly(2, 'MEDIUM', 'OFF 後歸檔區沒優雅消失', '殘留視覺讓 Emma 以為過濾還在')
    }

    // 對照：這裡不 assert isolateStripBox，只留給 shot 佐證
    expect(isolateStripBox).toBeDefined()
  })

  // ────────────────────────────────────────────────────────────────────────
  // UC3: /transactions 搜尋「醫療」+ 日期區間 preset
  // ────────────────────────────────────────────────────────────────────────
  test('UC3: /transactions 搜尋「醫療」+ 日期 preset', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/transactions`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await shot(page, 3, 1, 'landing')

    // 輸入搜尋詞
    const searchInput = page.getByPlaceholder(/尿布|午餐|老婆/).first()
    await softCheck(3, '搜尋框可見', async () => {
      await expect(searchInput).toBeVisible({ timeout: 10_000 })
    })
    await searchInput.fill('醫療')
    // debounce + supabase remote fetch
    await page.waitForTimeout(1_500)
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
    await shot(page, 3, 2, 'query-yi-liao')

    // 「搜尋疊整」摘要應該顯示（若有 results.length > 0 才會渲染 — 這是正確 gate）
    const summaryVisible = await page
      .getByText(/搜尋疊整/)
      .first()
      .isVisible({ timeout: 2_500 })
      .catch(() => false)
    let uc3ExpenseTotal: number | null = null
    let uc3ResultCount: number | null = null
    let uc3EmptyState = false
    if (!summaryVisible) {
      const emptyVisible = await page
        .getByText(/找不到符合/)
        .first()
        .isVisible({ timeout: 2_500 })
        .catch(() => false)
      if (emptyVisible) {
        uc3EmptyState = true
        recordAnomaly(
          3,
          'MEDIUM',
          '搜尋「醫療」無任何命中（空 seed）',
          '這個測試帳號沒有任何「醫療」相關支出資料，無法驗證搜尋 → 加總對帳正確性 / UC4 批次改分類；建議先跑 seed'
        )
      } else {
        recordAnomaly(3, 'HIGH', '搜尋疊整摘要區塊未渲染', '使用者不知搜到幾筆 / 加總多少')
      }
    } else {
      // 抓「找到 N 筆」跟「總共花費 $X」
      const summaryBlock = page.locator('text=搜尋疊整').first().locator('xpath=ancestor::div[1]')
      const raw = await summaryBlock.innerText({ timeout: 3_000 }).catch(() => '')
      const nMatch = raw.match(/找到\s*([\d,]+)\s*筆/)
      const totalMatch = raw.match(/總共花費[^\d\-]*(-?[\d,\.]+)/)
      if (nMatch) uc3ResultCount = Number(nMatch[1].replace(/,/g, ''))
      if (totalMatch) uc3ExpenseTotal = parseMoney(totalMatch[1])
      console.log(`  [UC3] 搜「醫療」→ ${uc3ResultCount ?? '?'} 筆，總花 ${uc3ExpenseTotal ?? '?'}`)
    }

    // 打開日期 Range Picker → 選「近 90 天」preset
    const rangePickerBtn = page.getByRole('button', { name: /日期區間|選擇日期區間/ }).first()
    if (await rangePickerBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await rangePickerBtn.click()
      await page.waitForTimeout(300)
      await shot(page, 3, 3, 'date-picker-open')
      const preset90 = page.getByRole('button', { name: '近 90 天' }).first()
      const preset90Visible = await preset90.isVisible({ timeout: 2_000 }).catch(() => false)
      if (!preset90Visible) {
        recordAnomaly(3, 'HIGH', '找不到「近 90 天」preset', 'Emma 得改手動輸入起訖，成本升高')
      } else {
        await preset90.click()
        await page.waitForTimeout(600)
        await shot(page, 3, 4, 'preset-90d')

        // 應該顯示更新的摘要 — 抓新數字比對是否有動
        const summaryVisibleAfter = await page
          .getByText(/搜尋疊整/)
          .first()
          .isVisible({ timeout: 1_500 })
          .catch(() => false)
        if (summaryVisibleAfter) {
          const summaryBlockAfter = page
            .locator('text=搜尋疊整')
            .first()
            .locator('xpath=ancestor::div[1]')
          const rawAfter = await summaryBlockAfter.innerText({ timeout: 3_000 }).catch(() => '')
          const nMatchAfter = rawAfter.match(/找到\s*([\d,]+)\s*筆/)
          const totalMatchAfter = rawAfter.match(/總共花費[^\d\-]*(-?[\d,\.]+)/)
          const nAfter = nMatchAfter ? Number(nMatchAfter[1].replace(/,/g, '')) : null
          const totalAfter = totalMatchAfter ? parseMoney(totalMatchAfter[1]) : null
          console.log(
            `  [UC3] 套用「近 90 天」後 → ${nAfter ?? '?'} 筆，總花 ${totalAfter ?? '?'}`
          )
          if (
            !uc3EmptyState &&
            nAfter === uc3ResultCount &&
            totalAfter === uc3ExpenseTotal &&
            uc3ResultCount !== null
          ) {
            recordAnomaly(
              3,
              'LOW',
              '套「近 90 天」preset 後摘要數字未變',
              '可能本來就在 90 天內故偽陰性；非確定性 bug'
            )
          }
        } else if (uc3EmptyState) {
          // 空狀態確認：日期 preset 也應該讓「找不到符合」訊息帶上日期範圍
          const emptyWithRange = await page
            .getByText(/2026-.*找不到|找不到符合.*2026/)
            .first()
            .isVisible({ timeout: 1_500 })
            .catch(() => false)
          if (!emptyWithRange) {
            recordAnomaly(
              3,
              'LOW',
              '空狀態文字沒帶上日期區間 hint',
              '空 seed 帳號無法確認 range 是否真的納入 hint 字串'
            )
          }
        }
      }
    } else {
      recordAnomaly(3, 'HIGH', '找不到 Date Range Picker 按鈕', '按鈕 aria-label / role 對不上')
    }

    // 附帶：記錄本次 UC3 結果供 cross-module compare
    ;(globalThis as unknown as { __uc3?: unknown }).__uc3 = {
      count: uc3ResultCount,
      total: uc3ExpenseTotal,
    }
  })

  // ────────────────────────────────────────────────────────────────────────
  // UC4: 多選 3 筆 → 批次「更改分類」
  // ────────────────────────────────────────────────────────────────────────
  test('UC4: 多選 3 筆 → 批次更改分類', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/transactions`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // 先搜「醫療」讓結果集聚焦
    const searchInput = page.getByPlaceholder(/尿布|午餐|老婆/).first()
    await searchInput.fill('醫療')
    await page.waitForTimeout(800)
    await shot(page, 4, 1, 'search-yi-liao')

    // 找到列表 checkbox — 排除 master checkbox（她的 label 有「全選」/「取消全選」）
    // 直接抓 role=checkbox 全部，跳過第一個（master）
    const checkboxes = page.getByRole('checkbox')
    const cbCount = await checkboxes.count()
    if (cbCount < 4) {
      recordAnomaly(
        4,
        'MEDIUM',
        `checkbox 只有 ${cbCount} 個 — 少於預期`,
        'seed 資料裡「醫療」相關筆數 < 3，UC4 執行不完；跳過批次驗證'
      )
      await shot(page, 4, 2, 'not-enough-rows')
      return
    }

    // 點 3 個 row checkbox（跳過 index 0 = master）
    for (let i = 1; i <= 3; i++) {
      await checkboxes.nth(i).click({ force: true }).catch(() => {})
      await page.waitForTimeout(120)
    }
    await shot(page, 4, 2, 'three-selected')

    // 底部懸浮 bar 應該滑上來，顯示「已選取 3 筆」
    const barLabel = page.getByText(/已選取\s*3\s*筆交易/).first()
    const barVisible = await barLabel.isVisible({ timeout: 3_000 }).catch(() => false)
    if (!barVisible) {
      // 也可能已選其他數目（因 master 誤點）
      const anyBar = await page.getByText(/已選取\s*\d+\s*筆交易/).first().isVisible().catch(() => false)
      if (anyBar) {
        recordAnomaly(
          4,
          'MEDIUM',
          '批次 bar 顯示的選中數 ≠ 3',
          '可能 master checkbox 被算進；或個別 row checkbox 沒完成點擊'
        )
      } else {
        recordAnomaly(
          4,
          'CRITICAL',
          '選 3 筆後底部懸浮批次工具列沒出現',
          'framer-motion animate 失敗 / createPortal 沒掛到 body / selectedIds 沒回傳'
        )
        await shot(page, 4, 3, 'no-bar')
        return
      }
    }
    await shot(page, 4, 3, 'bulk-bar-shown')

    // 點「批次操作 ▾」
    const bulkTrigger = page.getByRole('button', { name: /批次操作/ }).first()
    const triggerVisible = await bulkTrigger.isVisible().catch(() => false)
    if (!triggerVisible) {
      recordAnomaly(4, 'CRITICAL', '找不到「批次操作」按鈕', 'PopoverTrigger role 對不上')
      return
    }
    await bulkTrigger.click()
    await page.waitForTimeout(300)
    await shot(page, 4, 4, 'popover-open-tag-tab')

    // 檢查 Tabs 兩個：歸納專案 / 更改分類
    const tagTabVisible = await page.getByRole('tab', { name: /歸納專案/ }).first().isVisible().catch(() => false)
    const catTabVisible = await page.getByRole('tab', { name: /更改分類/ }).first().isVisible().catch(() => false)
    if (!tagTabVisible || !catTabVisible) {
      recordAnomaly(
        4,
        'HIGH',
        '批次操作 Popover 內 Tabs 缺項',
        `tag=${tagTabVisible} category=${catTabVisible}`
      )
    }

    // 切到「更改分類」
    if (catTabVisible) {
      await page.getByRole('tab', { name: /更改分類/ }).first().click()
      await page.waitForTimeout(200)
      await shot(page, 4, 5, 'category-tab')

      // 找一個分類 chip 點下去 — 優先「其他」 built-in code，最保險
      // 若能找到「醫療 / 家庭醫療」自訂分類更好
      const preferredCatBtns = [
        /家庭醫療/,
        /醫療保健/,
        /其他/,
      ]
      let clickedChip: string | null = null
      for (const pat of preferredCatBtns) {
        const chip = page.locator('[role="dialog"], .popover, div').getByRole('button', { name: pat }).first()
        if (await chip.isVisible().catch(() => false)) {
          const chipText = (await chip.innerText().catch(() => '')) || ''
          await chip.click()
          clickedChip = chipText.trim() || pat.source
          break
        }
      }
      if (!clickedChip) {
        recordAnomaly(
          4,
          'HIGH',
          '找不到任何分類 chip（家庭醫療 / 醫療保健 / 其他）',
          'buildCategoryChips 沒渲染或按鈕不是 role=button'
        )
      } else {
        console.log(`  [UC4] 點了分類 chip: ${clickedChip}`)
        // 等 toast
        await page.waitForTimeout(1200)
        await shot(page, 4, 6, 'after-apply-category')

        // 找 toast 「已把 N 筆更改為【X】」
        const toastOk = await page.getByText(/已把.*筆更改為/).first().isVisible().catch(() => false)
        if (!toastOk) {
          recordAnomaly(
            4,
            'HIGH',
            '按下分類 chip 後沒看到成功 toast',
            'sonner toast 可能在 fullPage screenshot 前已消失；或 action 失敗但錯誤 toast 沒顯示'
          )
        }

        // 看是否有「N 筆非支出被略過」提示 — 這是 spec 要求的誠實回報
        const skippedShown = await page.getByText(/筆非支出被略過/).first().isVisible().catch(() => false)
        console.log(`  [UC4] 略過提示 shown=${skippedShown}`)
      }
    }
  })

  test.afterAll(async () => {
    console.log('\n=== Anomaly Summary ===')
    console.log(`Total: ${anomalies.length}`)
    const bySev: Record<string, number> = {
      CRITICAL: anomalies.filter((a) => a.severity === 'CRITICAL').length,
      HIGH: anomalies.filter((a) => a.severity === 'HIGH').length,
      MEDIUM: anomalies.filter((a) => a.severity === 'MEDIUM').length,
      LOW: anomalies.filter((a) => a.severity === 'LOW').length,
    }
    console.log(
      `CRITICAL=${bySev.CRITICAL} HIGH=${bySev.HIGH} MEDIUM=${bySev.MEDIUM} LOW=${bySev.LOW}`
    )
    for (const a of anomalies) {
      console.log(`  [${a.severity}] UC${a.uc}: ${a.title} — ${a.detail}`)
    }
  })
})
