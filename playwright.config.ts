import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 20000,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://localhost:5199",
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "pnpm dev --port 5199 --strictPort",
    url: "http://localhost:5199",
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
