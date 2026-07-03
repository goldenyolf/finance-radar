/**
 * Persona-walk 測試登入憑證 — 一律走環境變數，絕不 hardcode 進 repo。
 *
 * 密碼是機密，過去被直接寫死在各 spec / walkthrough 報告裡並 push 上 GitHub；
 * 這裡集中改成從 `PERSONA_TEST_PW` 讀取，任何 spec 只 import 這支、不再各自貼字串。
 *
 * 跑法：
 *   PERSONA_TEST_PW='<你的測試密碼>' npx playwright test e2e/walkthrough/<spec> --workers 1 --reporter list
 *
 * email 非機密（是測試帳號識別碼），可用 `PERSONA_TEST_EMAIL` 覆蓋，未設時落預設。
 */

export const TEST_EMAIL =
  process.env.PERSONA_TEST_EMAIL ?? "austin.hung@rfdme.com";

/**
 * 回傳測試密碼；未設 `PERSONA_TEST_PW` 時 fail-loud（而不是靜默用空字串登入失敗）。
 * 用 function 而非 top-level const：讓 spec collection 階段不會因缺 env 就整批炸掉，
 * 只有真的要登入時才要求 env 存在。
 */
export function testPassword(): string {
  const pw = process.env.PERSONA_TEST_PW;
  if (!pw) {
    throw new Error(
      "缺少 PERSONA_TEST_PW 環境變數 — persona walk 的測試密碼不再 hardcode。" +
        "請用 `PERSONA_TEST_PW='<pw>' npx playwright test ...` 執行。"
    );
  }
  return pw;
}
