import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
    browserName: "chromium",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  reporter: "list",
  timeout: 60000,
});
