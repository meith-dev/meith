import { expect, test } from '@playwright/test'

import { E2E_BASE_URL } from './support/config'
import { enterAdminPanel, runTick } from './support/session'

test('mobile tabs scroll horizontally and reveal the active page after loading or resizing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/discover/unanswered')
  const strip = page.locator('[data-nav-tabs]')
  const active = strip.locator('[aria-current="page"]')
  await expect(active).toHaveAttribute('aria-current', 'page')
  await expect(active).toBeInViewport({ ratio: 1 })
  await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  expect(await strip.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0)

  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(active).toBeInViewport({ ratio: 1 })
  await page.setViewportSize({ width: 320, height: 740 })
  await expect(active).toBeInViewport({ ratio: 1 })
  await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)

  await strip.evaluate((element) => {
    element.querySelector('[aria-current]')!.removeAttribute('aria-current')
    element.querySelector('a')!.setAttribute('aria-current', 'page')
  })
  await expect(strip.locator('a').first()).toBeInViewport({ ratio: 1 })
})

test('password visibility preserves the value and does not submit the form', async ({ page }) => {
  await page.goto('/login')
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('a-private-test-value')
  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveAttribute('autocomplete', 'current-password')
  const toggle = page.getByRole('button', { name: 'Show password', exact: true })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue('a-private-test-value')
  await expect(page).toHaveURL('/login')
  await page.getByRole('button', { name: 'Hide password', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveValue('a-private-test-value')
})

test('password fields remain native without JavaScript and have no inert toggle', async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL, javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/login')
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password')
  await expect(page.getByRole('button', { name: 'Show password', exact: true })).toHaveCount(0)
  await context.close()
})

for (const javaScriptEnabled of [true, false]) {
  for (const theme of ['default', 'midnight', 'phasebook', 'raidframe', 'clubhouse']) {
    test(`${theme} panel drawers expose nested destinations and dismiss correctly with JavaScript ${javaScriptEnabled ? 'on' : 'off'}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        baseURL: E2E_BASE_URL,
        javaScriptEnabled,
        viewport: { width: 390, height: 600 },
      })
      const page = await context.newPage()
      await enterAdminPanel(page)
      await context.addCookies([{ name: 'meith_theme', value: theme, url: E2E_BASE_URL }])
      for (const [path, name] of [
        ['/usercp/options', 'Your account'],
        ['/modcp', 'Moderation'],
      ] as const) {
        await page.goto(path)
        const header = page.getByRole('banner')
        const opener = header.getByRole('button', { name: 'Open panel navigation', exact: true })
        await expect(opener).toHaveCount(1)
        await expect(
          header.getByRole('button', { name: 'Open navigation', exact: true }),
        ).toHaveCount(0)
        await opener.click()
        const panel = page.getByRole('dialog', { name, exact: true })
        await expect
          .poll(() => panel.evaluate((element) => getComputedStyle(element).translate))
          .toBe('0px')
        await panel.getByRole('button', { name: 'Close panel navigation' }).click()
        await expect(panel).toBeHidden()
      }
      await page.goto('/')
      await page
        .getByRole('banner')
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click()
      const mainMenu = page.locator('#board-mobile-navigation')
      await expect
        .poll(() => mainMenu.evaluate((element) => getComputedStyle(element).translate))
        .toBe('0px')
      await expect(mainMenu.getByRole('link', { name: 'New posts', exact: true })).toBeVisible()
      await mainMenu.getByRole('button', { name: 'Close navigation' }).click()
      await expect(mainMenu).toBeHidden()
      await page.goto('/admin')
      const toggle = page.getByRole('banner').getByRole('button', { name: 'Open panel navigation' })
      const drawer = page.getByRole('dialog', { name: 'Administration' })
      await toggle.click()
      await expect
        .poll(() => drawer.evaluate((element) => getComputedStyle(element).translate))
        .toBe('0px')
      await expect(drawer).toBeVisible()
      const bounds = (await drawer.boundingBox())!
      const contentRight = await page.evaluate(
        () => document.documentElement.getBoundingClientRect().right,
      )
      expect(bounds.x + bounds.width).toBeCloseTo(contentRight, 1)
      expect(bounds.x).toBeGreaterThan(0)
      await drawer.locator('summary').filter({ hasText: 'Board settings' }).click()
      const registration = drawer.getByRole('link', { name: 'Registration', exact: true })
      await expect(registration).toBeVisible()
      expect((await registration.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await registration.click()
      await expect(page).toHaveURL(/\/admin\/settings\?group=registration$/)
      await toggle.click()
      await expect
        .poll(() => drawer.evaluate((element) => getComputedStyle(element).translate))
        .toBe('0px')
      await expect(registration).toHaveAttribute('aria-current', 'page')
      await expect(registration).toBeVisible()
      await registration.focus()
      await expect(registration).toBeInViewport()
      await page.keyboard.press('Escape')
      await expect(drawer).toBeHidden()
      await expect(toggle).toBeFocused()
      await toggle.click()
      await expect
        .poll(() => drawer.evaluate((element) => getComputedStyle(element).translate))
        .toBe('0px')
      await page.mouse.click(10, 300)
      await expect(drawer).toBeHidden()
      await toggle.click()
      await expect
        .poll(() => drawer.evaluate((element) => getComputedStyle(element).translate))
        .toBe('0px')
      await drawer.getByRole('button', { name: 'Close panel navigation' }).click()
      await expect(drawer).toBeHidden()
      await context.close()
    })
  }
}

test('mobile search choices fit without horizontal scrolling and offer touch-sized controls', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    javaScriptEnabled: false,
    hasTouch: true,
    viewport: { width: 320, height: 740 },
  })
  const page = await context.newPage()
  const filters = page
    .locator('section')
    .filter({ has: page.getByRole('button', { name: 'Apply filters' }) })
  await expect(async () => {
    await runTick(request)
    await page.goto('/search?q=version')
    await expect(filters).toBeVisible()
  }).toPass({ timeout: 20_000, intervals: [500, 1_000, 2_000] })
  for (const control of await filters.locator('select, button').all()) {
    const box = (await control.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  expect(await filters.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await context.close()
})
