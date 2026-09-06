import { expect, test } from '@playwright/test'

import { E2E_BASE_URL } from './support/config'

const THEMES = ['default', 'midnight', 'phasebook', 'raidframe', 'clubhouse']

test.use({ javaScriptEnabled: false })

for (const theme of THEMES) {
  test(`${theme} reading and forms fit phone, tablet and desktop widths`, async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: 'meith_theme', value: theme, url: E2E_BASE_URL }])
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      for (const path of ['/', '/200-general', '/thread/22', '/search', '/login']) {
        await page.goto(path)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          `${theme} ${path} at ${width}px`,
        ).toBe(true)
      }
    }
  })
}

for (const theme of ['default', 'clubhouse']) {
  test(`${theme} listing columns follow the card width`, async ({ page, context }) => {
    await context.addCookies([{ name: 'meith_theme', value: theme, url: E2E_BASE_URL }])
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/200-general')
    const row = page.locator('[data-slot="card-rows"] > li').filter({
      has: page.getByRole('link', { name: 'What are you reading this week?', exact: true }),
    })
    await expect(row).toHaveCount(1)

    const columns = () =>
      row.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
    expect(await columns()).toBeGreaterThan(2)
    await row.evaluate((element) => {
      const card = element.closest<HTMLElement>('[data-slot="card"]')!
      card.style.width = '640px'
    })
    expect(await columns()).toBe(2)
    expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  })
}

test('touch fields, primary actions and navigation retain usable targets', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    javaScriptEnabled: false,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await page.goto('/login')
  for (const control of [
    page.getByLabel('Username or email'),
    page.getByLabel('Password'),
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await page.goto('/200-general')
  expect(
    (await page.getByRole('link', { name: 'Top rated' }).boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44)
  await context.close()
})
