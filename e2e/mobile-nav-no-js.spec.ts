import { expect, test } from '@playwright/test'

import { enterAdminPanel } from './support/session'

const MOBILE = { width: 390, height: 844 }

test.use({ javaScriptEnabled: false, viewport: MOBILE })

test('the collapsed header nav is reachable without JavaScript', async ({ page }) => {
  await page.goto('/')
  const mobileNav = page.getByRole('banner').locator('[data-nav-view="mobile"]')

  const link = mobileNav.getByRole('link', { name: 'New posts' })
  await expect(link).toBeHidden()

  const toggle = mobileNav.locator('summary').filter({ hasText: 'Board sections' })
  await expect(toggle).toBeVisible()

  await toggle.click()
  await expect(link).toBeVisible()

  await link.click()
  await expect(page).toHaveURL(/\/discover\/new$/)
})

test("a nav item's dropdown opens and closes via its own disclosure, without JavaScript", async ({
  page,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/content/navigation')
  const newItem = page.locator('section', {
    has: page.getByRole('heading', { name: 'New menu item' }),
  })
  await newItem.getByLabel('Label').fill('Guidelines')
  await newItem.getByLabel('Address').fill('/community/guidelines')
  await newItem.getByLabel('Inside').selectOption({ label: 'Members' })
  await newItem.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Added.')).toBeVisible()

  await page.goto('/')
  const mobileNav = page.getByRole('banner').locator('[data-nav-view="mobile"]')
  await mobileNav.locator('summary').filter({ hasText: 'Board sections' }).click()

  const submenuToggle = mobileNav
    .locator('summary')
    .filter({ has: page.getByRole('link', { name: 'Members', exact: true }) })
    .locator('span')
    .last()
  const child = mobileNav.getByRole('link', { name: 'Guidelines', exact: true })

  await expect(child).toBeHidden()
  await submenuToggle.click()
  await expect(child).toBeVisible()

  await submenuToggle.click()
  await expect(child).toBeHidden()

  await submenuToggle.click()
  await child.click()
  await expect(page).toHaveURL(/\/community\/guidelines$/)
})
