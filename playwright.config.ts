import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      threshold: 0.2
    }
  },
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 520, height: 800 }
  },
  webServer: {
    command: 'npx vite --config vite.test.config.ts',
    port: 5173,
    reuseExistingServer: true,
    timeout: 15000
  }
})
