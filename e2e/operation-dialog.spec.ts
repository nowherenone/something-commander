import { test, expect } from '@playwright/test'

test.describe('Operation Dialog Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/test-harness')
    // Wait for React to render
    await page.waitForSelector('h2')
  })

  test('all dialog variants render without layout shift', async ({ page }) => {
    // Full page screenshot — all variants visible at once
    await page.waitForTimeout(500) // let animations settle
    await expect(page).toHaveScreenshot('all-dialogs.png', {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('enumerating state shows scanning message and animated bar', async ({ page }) => {
    const dialog = page.locator('[data-testid="op-dialog"]').first()
    await expect(dialog).toBeVisible()

    // Check title says "Copying"
    const title = dialog.locator('[data-testid="op-title"]')
    await expect(title).toContainText('Copying')

    // Current file shows "Scanning files..."
    const currentFile = dialog.locator('[data-testid="op-current-file"]')
    await expect(currentFile).toContainText('Scanning files...')

    // Screenshot just this dialog
    await expect(dialog).toHaveScreenshot('dialog-enumerating.png', {
      animations: 'disabled'
    })
  })

  test('copying_early state shows file progress and overall progress', async ({ page }) => {
    // Second dialog (index 1)
    const dialog = page.locator('[data-testid="op-dialog"]').nth(1)
    await expect(dialog).toBeVisible()

    // Title should show percentage
    const title = dialog.locator('[data-testid="op-title"]')
    await expect(title).toContainText('Copying')

    // Current file shows the filename
    const currentFile = dialog.locator('[data-testid="op-current-file"]')
    await expect(currentFile).toContainText('src\\components\\App.tsx')

    // File count shows "File 3 of 47"
    const fileCount = dialog.locator('[data-testid="op-file-count"]')
    await expect(fileCount).toContainText('File 3 of 47')

    // Bytes info visible
    const bytes = dialog.locator('[data-testid="op-bytes"]')
    await expect(bytes).not.toBeEmpty()

    await expect(dialog).toHaveScreenshot('dialog-copying-early.png', {
      animations: 'disabled'
    })
  })

  test('copying_halfway state shows correct progress for large files', async ({ page }) => {
    const dialog = page.locator('[data-testid="op-dialog"]').nth(2)
    await expect(dialog).toBeVisible()

    // Title says "Moving" with percentage
    const title = dialog.locator('[data-testid="op-title"]')
    await expect(title).toContainText('Moving')

    // File progress shows GB values
    const filePct = dialog.locator('[data-testid="op-file-pct"]')
    await expect(filePct).toContainText('GB')

    // Speed should be visible
    const speed = dialog.locator('[data-testid="op-speed"]')
    const speedText = await speed.textContent()
    expect(speedText?.trim()).not.toBe('')

    await expect(dialog).toHaveScreenshot('dialog-copying-halfway.png', {
      animations: 'disabled'
    })
  })

  test('overwrite prompt shows source vs existing comparison', async ({ page }) => {
    const dialog = page.locator('[data-testid="op-dialog"]').nth(3)
    await expect(dialog).toBeVisible()

    // Source name visible
    await expect(dialog.locator('[data-testid="ow-source-name"]')).toContainText('report.docx')

    // Destination name visible
    await expect(dialog.locator('[data-testid="ow-dest-name"]')).toContainText('report.docx')

    // Source size
    await expect(dialog.locator('[data-testid="ow-source-meta"]')).toContainText('kB')

    // All 4 buttons visible
    await expect(dialog.locator('[data-testid="ow-overwrite"]')).toBeVisible()
    await expect(dialog.locator('[data-testid="ow-skip"]')).toBeVisible()
    await expect(dialog.locator('[data-testid="ow-overwrite-all"]')).toBeVisible()
    await expect(dialog.locator('[data-testid="ow-skip-all"]')).toBeVisible()

    await expect(dialog).toHaveScreenshot('dialog-overwrite.png', {
      animations: 'disabled'
    })
  })

  test('error state shows error message and OK button', async ({ page }) => {
    const dialog = page.locator('[data-testid="op-dialog"]').nth(4)
    await expect(dialog).toBeVisible()

    // Error message visible
    const error = dialog.locator('[data-testid="op-error"]')
    await expect(error).toContainText('ENOSPC')

    // OK button visible
    await expect(dialog.locator('[data-testid="op-ok"]')).toBeVisible()

    // No cancel button
    await expect(dialog.locator('[data-testid="op-cancel"]')).not.toBeVisible()

    await expect(dialog).toHaveScreenshot('dialog-error.png', {
      animations: 'disabled'
    })
  })

  test('cancelled state shows cancelled message', async ({ page }) => {
    const dialog = page.locator('[data-testid="op-dialog"]').nth(5)
    await expect(dialog).toBeVisible()

    const cancelled = dialog.locator('[data-testid="op-cancelled"]')
    await expect(cancelled).toContainText('Cancelled at file 8 of 25')

    await expect(dialog).toHaveScreenshot('dialog-cancelled.png', {
      animations: 'disabled'
    })
  })

  test('delete operation does not show From/To paths', async ({ page }) => {
    const dialog = page.locator('[data-testid="op-dialog"]').nth(6)
    await expect(dialog).toBeVisible()

    // Title says "Deleting"
    const title = dialog.locator('[data-testid="op-title"]')
    await expect(title).toContainText('Deleting')

    // No "From:" or "To:" labels
    await expect(dialog.locator('[data-testid="op-from"]')).not.toBeVisible()
    await expect(dialog.locator('[data-testid="op-to"]')).not.toBeVisible()

    await expect(dialog).toHaveScreenshot('dialog-deleting.png', {
      animations: 'disabled'
    })
  })

  test('all dialogs have consistent width', async ({ page }) => {
    const dialogs = page.locator('[data-testid="op-dialog"]')
    const count = await dialogs.count()

    const widths: number[] = []
    for (let i = 0; i < count; i++) {
      const box = await dialogs.nth(i).boundingBox()
      if (box) widths.push(Math.round(box.width))
    }

    // All dialogs should have the same width
    const uniqueWidths = [...new Set(widths)]
    expect(uniqueWidths.length).toBe(1)
    expect(uniqueWidths[0]).toBe(480)
  })

  test('all dialogs have aligned internal elements', async ({ page }) => {
    const dialogs = page.locator('[data-testid="op-dialog"]')
    const count = await dialogs.count()

    for (let i = 0; i < count; i++) {
      const dialog = dialogs.nth(i)
      const box = await dialog.boundingBox()
      if (!box) continue

      // Check that current file row has consistent height
      const currentFile = dialog.locator('[data-testid="op-current-file"]')
      if (await currentFile.isVisible()) {
        const cfBox = await currentFile.boundingBox()
        expect(cfBox?.height).toBe(28)
      }

      // Check progress sections have consistent height
      const fileProgress = dialog.locator('[data-testid="op-file-progress"]')
      if (await fileProgress.isVisible()) {
        const fpBox = await fileProgress.boundingBox()
        expect(fpBox?.height).toBe(44)
      }

      const totalProgress = dialog.locator('[data-testid="op-total-progress"]')
      if (await totalProgress.isVisible()) {
        const tpBox = await totalProgress.boundingBox()
        expect(tpBox?.height).toBe(44)
      }
    }
  })
})
