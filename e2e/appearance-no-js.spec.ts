import { expect, test, type Page } from '@playwright/test'

test.use({ javaScriptEnabled: false })

const listingTables = (page: Page) => page.locator('table').count()

async function cookies(page: Page) {
  const jar = await page.context().cookies()
  return Object.fromEntries(jar.map((cookie) => [cookie.name, cookie.value]))
}

test('a member switches theme and colour scheme without JavaScript', async ({ page }) => {
  await page.goto('/')

  const strip = page.getByRole('region', { name: 'Appearance' })
  await expect(strip).toBeVisible()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'default')
  expect(await listingTables(page)).toBe(0)

  await strip.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)

  expect(await cookies(page)).not.toHaveProperty('meith_theme')

  await strip.getByLabel('Theme').selectOption('midnight')
  await strip.getByRole('button', { name: 'Apply' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
  expect(await listingTables(page)).toBeGreaterThan(0)
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
  expect(await listingTables(page)).toBeGreaterThan(0)

  await strip.getByRole('button', { name: 'System', exact: true }).click()
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)(dark|light)(\s|$)/)
  expect((await cookies(page)).meith_scheme).toBe('system')
})

test('a theme an administrator turns off stops rendering for the member who chose it', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'meith_theme', value: 'not-installed', url: 'http://127.0.0.1:3001' },
  ])

  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'default')
  expect(await listingTables(page)).toBe(0)
})
