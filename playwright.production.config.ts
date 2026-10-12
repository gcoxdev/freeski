import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/usr/bin/chromium";
const launchOptions = {
  ...(existsSync(chromiumPath) ? { executablePath: chromiumPath } : {}),
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--enable-gpu-rasterization",
    "--enable-zero-copy",
    "--ignore-gpu-blocklist",
  ],
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4174",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "production-chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions,
      },
    },
    { name: "production-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "production-webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run preview -- --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
