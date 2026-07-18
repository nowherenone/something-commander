import { defineConfig } from '@playwright/test'

/**
 * Visual regression suite for operation dialogs (Playwright + Vite test harness).
 * Does not launch Electron — renders React UI at /#/test-harness.
 *
 *   npm run test:visual          # run
 *   npm run test:e2e:update      # refresh snapshots after intentional UI changes
 *   npm run test:all             # unit (vitest) + visual (playwright)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2
    }
  },
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 520, height: 900 },
    // Deterministic screenshots
    deviceScaleFactor: 1,
    colorScheme: 'dark'
  },
  webServer: {
    command: 'npx vite --config vite.test.config.ts',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
})
