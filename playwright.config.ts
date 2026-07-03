import { defineConfig } from "@playwright/test";

/**
 * Playwright config — persona walkthrough runs only.
 * Not for production test suite. Persona agents pin their own headless + viewport
 * inside each spec's `test.use()`; global defaults here are minimal.
 */
export default defineConfig({
  testDir: "./e2e/walkthrough",
  timeout: 90_000,
  expect: { timeout: 8_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "off",
    video: "off",
    ignoreHTTPSErrors: true,
  },
});
