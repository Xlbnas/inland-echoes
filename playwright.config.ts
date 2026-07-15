import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 3100);
const customPort = port + 1;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /custom-provider\.spec\.ts/u,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile",
      testIgnore: /custom-provider\.spec\.ts/u,
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        channel: "chrome",
      },
    },
    {
      name: "custom-providers",
      testMatch: /custom-provider\.spec\.ts/u,
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        baseURL: `http://127.0.0.1:${customPort}`,
      },
    },
  ],
  webServer: [
    {
      command: `NEXT_DIST_DIR=.next/e2e-default RATE_LIMIT_UNITS_PER_MINUTE=10000 npm run dev -- --port ${port}`,
      url: `http://127.0.0.1:${port}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `NEXT_DIST_DIR=.next/e2e-custom RATE_LIMIT_UNITS_PER_MINUTE=10000 CUSTOM_PROVIDERS_ENABLED=true npm run dev -- --port ${customPort}`,
      url: `http://127.0.0.1:${customPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
