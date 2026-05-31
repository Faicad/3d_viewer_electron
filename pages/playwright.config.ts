import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:4183',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npx vitepress preview . --port 4183',
    port: 4183,
    reuseExistingServer: true,
    timeout: 30000,
  },
})
