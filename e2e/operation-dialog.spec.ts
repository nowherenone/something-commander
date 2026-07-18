import { test, expect } from '@playwright/test'

/**
 * Visual + behavioral tests for the operation dialog.
 * Served by vite.test.config.ts at /#/test-harness (no Electron required).
 *
 * Run:  npm run test:e2e
 * Update snapshots after intentional UI changes:  npm run test:e2e:update
 */

test.describe('Operation Dialog Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/test-harness')
    await page.waitForSelector('[data-testid="test-harness"]')
  })

  test('all dialog variants render without layout shift', async ({ page }) => {
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('all-dialogs.png', {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('enumerating state shows scanning message and animated bar', async ({ page }) => {
    const dialog = page.locator('[data-testid="harness-enumerating"] [data-testid="op-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-testid="op-title"]')).toContainText('Copying')
    await expect(dialog.locator('[data-testid="op-current-file"]')).toContainText('Scanning files...')
    await expect(dialog).toHaveScreenshot('dialog-enumerating.png', { animations: 'disabled' })
  })

  test('copying_early state shows file progress and overall progress', async ({ page }) => {
    const dialog = page.locator('[data-testid="harness-copying_early"] [data-testid="op-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-testid="op-title"]')).toContainText('Copying')
    await expect(dialog.locator('[data-testid="op-current-file"]')).toContainText('src\\components\\App.tsx')
    await expect(dialog.locator('[data-testid="op-file-count"]')).toContainText('File 3 of 47')
    await expect(dialog.locator('[data-testid="op-bytes"]')).not.toBeEmpty()
    await expect(dialog).toHaveScreenshot('dialog-copying-early.png', { animations: 'disabled' })
  })

  test('copying_halfway state shows correct progress for large files', async ({ page }) => {
    const dialog = page.locator('[data-testid="harness-copying_halfway"] [data-testid="op-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-testid="op-title"]')).toContainText('Moving')
    await expect(dialog.locator('[data-testid="op-file-pct"]')).toContainText('GB')
    const speedText = await dialog.locator('[data-testid="op-speed"]').textContent()
    expect(speedText?.trim()).not.toBe('')
    await expect(dialog).toHaveScreenshot('dialog-copying-halfway.png', { animations: 'disabled' })
  })

  test('zip large-file copy shows mid-file progress bar and bytes', async ({ page }) => {
    const dialog = page.locator('[data-testid="harness-zip_copy_progress"] [data-testid="op-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-testid="op-current-file"]')).toContainText('video.mp4')
    // 30% of 500 MB ≈ 150 MB — must show concrete sizes, not blank
    await expect(dialog.locator('[data-testid="op-file-pct"]')).toContainText('MB')
    await expect(dialog.locator('[data-testid="op-file-bar"]')).toBeVisible()
    const bar = dialog.locator('[data-testid="op-file-bar"]')
    const width = await bar.evaluate((el) => (el as HTMLElement).style.width)
    // ~30%
    const pct = parseInt(width, 10)
    expect(pct).toBeGreaterThanOrEqual(25)
    expect(pct).toBeLessThanOrEqual(35)
    await expect(dialog).toHaveScreenshot('dialog-zip-copy-progress.png', { animations: 'disabled' })
  })

  test('overwrite prompt shows source vs existing comparison', async ({ page }) => {
    const dialog = page.locator('[data-testid="harness-overwrite_prompt"] [data-testid="op-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-testid="ow-source-name"]')).toContainText('report.docx')
    await expect(dialog.locator('[data-testid="ow-dest-name"]')).toContainText('report.docx')
    await expect(dialog.locator('[data-testid="ow-source-meta"]')).toContainText('kB')
    await expect(dialog.locator('[data-testid="ow-overwrite"]')).toBeVisible()
    await expect(dialog.locator('[data-testid="ow-skip"]')).toBeVisible()
    await expect(dialog.locator('[data-testid="ow-overwrite-all"]')).toBeVisible()
    await expect(dialog.locator('[data-testid="ow-skip-all"]')).toBeVisible()
    await expect(dialog).toHaveScreenshot('dialog-overwrite.png', { animations: 'disabled' })
  })

  test('error state shows error message and OK button', async ({ page }) => {
    const dialog = page.locator('[data-testid="harness-error"] [data-testid="op-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-testid="op-error"]')).toContainText('ENOSPC')
    await expect(dialog.locator('[data-testid="op-ok"]')).toBeVisible()
    await expect(dialog.locator('[data-testid="op-cancel"]')).not.toBeVisible()
    await expect(dialog).toHaveScreenshot('dialog-error.png', { animations: 'disabled' })
  })

  test('cancelled state shows cancelled message', async ({ page }) => {
    const dialog = page.locator('[data-testid="harness-cancelled"] [data-testid="op-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-testid="op-cancelled"]')).toContainText('Cancelled at file 8 of 25')
    await expect(dialog).toHaveScreenshot('dialog-cancelled.png', { animations: 'disabled' })
  })

  test('delete operation does not show From/To paths', async ({ page }) => {
    const dialog = page.locator('[data-testid="harness-deleting"] [data-testid="op-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-testid="op-title"]')).toContainText('Deleting')
    await expect(dialog.locator('[data-testid="op-from"]')).not.toBeVisible()
    await expect(dialog.locator('[data-testid="op-to"]')).not.toBeVisible()
    await expect(dialog).toHaveScreenshot('dialog-deleting.png', { animations: 'disabled' })
  })

  test('all dialogs have consistent width', async ({ page }) => {
    const dialogs = page.locator('[data-testid="op-dialog"]')
    const count = await dialogs.count()
    const widths: number[] = []
    for (let i = 0; i < count; i++) {
      const box = await dialogs.nth(i).boundingBox()
      if (box) widths.push(Math.round(box.width))
    }
    const uniqueWidths = [...new Set(widths)]
    expect(uniqueWidths.length).toBe(1)
    expect(uniqueWidths[0]).toBe(480)
  })

  test('all dialogs have aligned internal elements', async ({ page }) => {
    // Consistency across variants (token-driven chrome), not pixel magic numbers.
    const dialogs = page.locator('[data-testid="op-dialog"]')
    const count = await dialogs.count()
    const currentFileHeights: number[] = []
    const fileProgressHeights: number[] = []
    const totalProgressHeights: number[] = []

    for (let i = 0; i < count; i++) {
      const dialog = dialogs.nth(i)
      const currentFile = dialog.locator('[data-testid="op-current-file"]')
      if (await currentFile.isVisible()) {
        const cfBox = await currentFile.boundingBox()
        if (cfBox) currentFileHeights.push(Math.round(cfBox.height))
      }
      const fileProgress = dialog.locator('[data-testid="op-file-progress"]')
      if (await fileProgress.isVisible()) {
        const fpBox = await fileProgress.boundingBox()
        if (fpBox) fileProgressHeights.push(Math.round(fpBox.height))
      }
      const totalProgress = dialog.locator('[data-testid="op-total-progress"]')
      if (await totalProgress.isVisible()) {
        const tpBox = await totalProgress.boundingBox()
        if (tpBox) totalProgressHeights.push(Math.round(tpBox.height))
      }
    }

    expect(currentFileHeights.length).toBeGreaterThan(0)
    expect(new Set(currentFileHeights).size).toBe(1)
    expect(fileProgressHeights.length).toBeGreaterThan(0)
    expect(new Set(fileProgressHeights).size).toBe(1)
    expect(totalProgressHeights.length).toBeGreaterThan(0)
    expect(new Set(totalProgressHeights).size).toBe(1)
    // File and total progress sections share the same chrome height
    expect(fileProgressHeights[0]).toBe(totalProgressHeights[0])
  })
})

test.describe('Live zip progress UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/test-harness')
    await page.waitForSelector('[data-testid="live-zip-progress"]')
  })

  test('stepping progress updates labels and bar width', async ({ page }) => {
    const root = page.locator('[data-testid="live-zip-progress"]')
    const dialog = root.locator('[data-testid="op-dialog"]')

    // 0% — bar at 0, shows 0 / 500 MB
    await page.click('[data-testid="progress-step-0"]')
    await expect(page.locator('[data-testid="live-progress-pct"]')).toHaveText('0%')
    await expect(dialog.locator('[data-testid="op-file-pct"]')).toContainText('0')
    let width = await dialog.locator('[data-testid="op-file-bar"]').evaluate((el) => (el as HTMLElement).style.width)
    expect(parseInt(width, 10)).toBe(0)

    // 25%
    await page.click('[data-testid="progress-step-25"]')
    await expect(page.locator('[data-testid="live-progress-pct"]')).toHaveText('25%')
    width = await dialog.locator('[data-testid="op-file-bar"]').evaluate((el) => (el as HTMLElement).style.width)
    expect(parseInt(width, 10)).toBe(25)
    await expect(dialog.locator('[data-testid="op-total-pct"]')).toContainText('25%')
    await expect(dialog).toHaveScreenshot('live-zip-progress-25.png', { animations: 'disabled' })

    // 50%
    await page.click('[data-testid="progress-step-50"]')
    width = await dialog.locator('[data-testid="op-file-bar"]').evaluate((el) => (el as HTMLElement).style.width)
    expect(parseInt(width, 10)).toBe(50)
    await expect(dialog.locator('[data-testid="op-title"]')).toContainText('50%')
    await expect(dialog).toHaveScreenshot('live-zip-progress-50.png', { animations: 'disabled' })

    // 100%
    await page.click('[data-testid="progress-step-100"]')
    width = await dialog.locator('[data-testid="op-file-bar"]').evaluate((el) => (el as HTMLElement).style.width)
    expect(parseInt(width, 10)).toBe(100)
    await expect(dialog.locator('[data-testid="op-total-pct"]')).toContainText('100%')
    await expect(dialog).toHaveScreenshot('live-zip-progress-100.png', { animations: 'disabled' })
  })

  test('progress never stays blank while a large zip file is “copying”', async ({ page }) => {
    const dialog = page.locator('[data-testid="live-zip-progress"] [data-testid="op-dialog"]')
    for (const p of [10, 50, 75]) {
      await page.click(`[data-testid="progress-step-${p}"]`)
      const filePct = await dialog.locator('[data-testid="op-file-pct"]').textContent()
      expect(filePct?.trim()).not.toBe('')
      expect(filePct).toMatch(/MB|GB|kB|B/)
      const barWidth = await dialog.locator('[data-testid="op-file-bar"]').evaluate(
        (el) => (el as HTMLElement).style.width
      )
      expect(parseInt(barWidth, 10)).toBe(p)
    }
  })
})
