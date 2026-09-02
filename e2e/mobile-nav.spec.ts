import { expect, test } from '@playwright/test'

const MOBILE = { width: 390, height: 844 }

test.use({ viewport: MOBILE })

test('an outside tap closes the open mobile nav disclosure', async ({ page }) => {
  await page.goto('/')
  const banner = page.getByRole('banner')

  const toggle = banner.locator('summary').filter({ hasText: 'Board sections' })
  const link = banner.getByRole('link', { name: 'New posts' })

  await toggle.click()
  await expect(link).toBeVisible()

  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  })
  await expect(link).toBeHidden()
})

test('Escape closes the open mobile nav disclosure', async ({ page }) => {
  await page.goto('/')
  const banner = page.getByRole('banner')

  const toggle = banner.locator('summary').filter({ hasText: 'Board sections' })
  const link = banner.getByRole('link', { name: 'New posts' })

  await toggle.click()
  await expect(link).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(link).toBeHidden()
})
