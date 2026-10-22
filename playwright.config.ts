import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 20000,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "pnpm dev --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
