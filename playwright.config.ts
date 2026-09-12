import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 30000,
  use: {
    baseURL: process.env.BROWSER_BASE_URL || "http://127.0.0.1:3000",
    headless: true,
  },
  reporter: "list",
  webServer: process.env.BROWSER_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: "http://127.0.0.1:3000/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
        env: {
          ALLOW_PUBLIC_DEMO: "true",
          APP_ACCESS_PASSWORD: "",
          HOSTNAME: "127.0.0.1",
          PORT: "3000",
        },
      },
});
