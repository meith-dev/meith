import { expect, test } from '@playwright/test'

const MOBILE = { width: 390, height: 844 }

test.use({ viewport: MOBILE })

test('an outside tap closes the open mobile navigation drawer', async ({ page }) => {
  await page.goto('/')
  const mobileNav = page.getByRole('banner').locator('[data-nav-view="mobile"]')

  const toggle = mobileNav.getByRole('button', { name: 'Open navigation', exact: true })
  const link = mobileNav.getByRole('link', { name: 'New posts' })

  await toggle.click()
  await expect(link).toBeVisible()
  await expect
    .poll(() =>
      mobileNav.getByRole('dialog').evaluate((element) => getComputedStyle(element).translate),
    )
    .toBe('0px')

  await page.mouse.click(10, 300)
  await expect(link).toBeHidden()
})

test('Escape closes the open mobile navigation drawer', async ({ page }) => {
  await page.goto('/')
  const mobileNav = page.getByRole('banner').locator('[data-nav-view="mobile"]')

  const toggle = mobileNav.getByRole('button', { name: 'Open navigation', exact: true })
  const link = mobileNav.getByRole('link', { name: 'New posts' })

  await toggle.click()
  await expect(link).toBeVisible()
  await expect
    .poll(() =>
      mobileNav.getByRole('dialog').evaluate((element) => getComputedStyle(element).translate),
    )
    .toBe('0px')

  await link.focus()
  await page.keyboard.press('Escape')
  await expect(link).toBeHidden()
  await expect(toggle).toBeFocused()
})
