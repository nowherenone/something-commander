import { defineConfig } from '@playwright/test'

/**
 * Real-Electron end-to-end tests (keyboard/focus behaviour the Vite harness
 * can't reproduce). Runs against the production build in ./out:
 *
 *   npm run test:e2e:electron          # builds, then runs
 *   xvfb-run -a npm run test:e2e:electron   # headless Linux
 */
export default defineConfig({
  testDir: './e2e-electron',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']]
})
