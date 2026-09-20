import { expect, test } from '@playwright/test'

const routes = [
  '/',
  '/about',
  '/who-its-for',
  '/who-its-for/communities',
  '/who-its-for/clubs-and-associations',
  '/who-its-for/developers',
  '/who-its-for/open-source',
  '/who-its-for/legacy-forums',
  '/extensions',
  '/extensions/default',
  '/docs',
]

for (const width of [390, 1440]) {
  test(`marketing pages fit a ${width}px viewport`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 900 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    for (const route of routes) {
      const response = await page.goto(route)
      expect(response?.status(), route).toBe(200)
      await expect(page.getByRole('heading', { level: 1 }), route).toBeVisible()
      await expect(page.getByRole('banner'), route).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        route,
      ).toBe(true)
    }

    expect(errors).toEqual([])
  })
}

test('colour scheme persists across navigation and resets to the system preference', async ({
  page,
}) => {
  await page.goto('/')
  const scheme = page.getByRole('contentinfo').getByRole('group', { name: 'Colour scheme' })
  await expect(page.getByRole('banner').getByRole('group', { name: 'Colour scheme' })).toHaveCount(
    0,
  )
  await scheme.getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await scheme.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.goto('/about')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(scheme.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
  await scheme.getByRole('button', { name: 'System' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
  await page.reload()
  await expect(scheme.getByRole('button', { name: 'System' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('mobile navigation closes on Escape, outside interaction, and link selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const menu = page.getByLabel('Navigation menu')
  const navigation = page.getByRole('navigation', { name: 'Mobile site', exact: true })

  await menu.click()
  await expect(navigation).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(navigation).toBeHidden()
  await expect(menu).toBeFocused()

  await menu.click()
  await page.getByRole('banner').getByRole('link', { name: 'Meith home' }).click()
  await expect(navigation).toBeHidden()

  await menu.click()
  await navigation.getByRole('link', { name: 'Extensions', exact: true }).click()
  await expect(page).toHaveURL(/\/extensions$/)
  await expect(navigation).toBeHidden()
})

test('site navigation points to real destinations and exposes customisation guides', async ({
  page,
}) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Site', exact: true })
  for (const [name, href] of [
    ['Home', '/'],
    ['About', '/about'],
    ['Who it’s for', '/who-its-for'],
    ['Extensions', '/extensions'],
    ['Docs', '/docs'],
  ] as const) {
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
  }
  await expect(nav.getByRole('link', { name: /^Demo/ })).toHaveAttribute(
    'href',
    /^https:\/\/demo\./,
  )
  await expect(nav.getByRole('link', { name: /^Community/ })).toHaveAttribute(
    'href',
    /^https:\/\/forum\./,
  )

  const customise = page.getByRole('navigation', { name: 'Customise Meith', exact: true })
  for (const [name, href] of [
    ['Build a theme', '/docs/themes'],
    ['Write a plugin', '/docs/plugins'],
    ['Connect through the API', '/docs/api'],
  ] as const) {
    await expect(customise.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute(
      'href',
      href,
    )
  }

  const audiences = [
    { name: /^Developers/, slug: 'developers' },
    { name: /^Open-source projects/, slug: 'open-source' },
    { name: /^Communities/, slug: 'communities' },
    { name: /^Clubs and associations/, slug: 'clubs-and-associations' },
  ]

  for (const audience of audiences) {
    await page.goto('/')
    const link = page.getByRole('main').getByRole('link', { name: audience.name })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', `/who-its-for/${audience.slug}`)
    await link.focus()
    await expect(link).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/who-its-for/${audience.slug}$`))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
})

test('the homepage says what Meith is built on, with a version for each part', async ({ page }) => {
  await page.goto('/')
  const section = page.getByRole('region', { name: /Built on the latest technology/ })
  await expect(section).toBeVisible()

  for (const name of ['Node.js', 'TypeScript', 'Next.js', 'Base UI', 'PostgreSQL']) {
    const item = section
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) })
    await expect(item, name).toHaveCount(1)
    await expect(item.getByText(/^\d+$/), name).toBeVisible()
  }

  await expect(section.getByRole('link', { name: /^How it fits together/ })).toHaveAttribute(
    'href',
    '/docs/architecture',
  )
})

test('old catalogue pages redirect without moving the update feed or images', async ({
  request,
}) => {
  for (const path of ['', '/default']) {
    const response = await request.get(`/marketplace${path}`, { maxRedirects: 0 })
    expect(response.status()).toBe(308)
    expect(response.headers().location).toBe(`/extensions${path}`)
  }
  for (const path of ['/marketplace/v1.json', '/marketplace/screenshots/default-light.png']) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status()).toBe(200)
  }
})

test('the forum island switches real themes and palettes without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto('http://localhost:3100/')
  const preview = page.locator('#board-preview')
  await expect(preview.getByRole('radio', { name: 'Default', exact: true })).toBeChecked()
  await expect(preview.locator('img, iframe')).toHaveCount(0)
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const name of ['Default', 'Clubhouse', 'Phasebook', 'Raidframe', 'Midnight']) {
      await preview.getByRole('radio', { name, exact: true }).check()
      const panel = preview.locator(`[data-board-theme="${name.toLowerCase()}"]`)
      await expect(panel).toBeVisible()
      await expect(preview.locator('.board-preview-panel:visible')).toHaveCount(1)
      await expect(
        panel.getByRole('link', { name: 'General discussions', exact: true }),
      ).toBeVisible()
      if (name === 'Clubhouse') {
        const labels = panel
          .locator('li')
          .first()
          .locator('span[class~="md:hidden"]')
          .filter({ visible: true })
        await expect(labels).toHaveCount(2)
        for (const label of await labels.all()) await expect(label).toHaveCSS('display', 'inline')
      }
      await preview.getByRole('radio', { name: 'Light', exact: true }).check()
      const light = await panel.evaluate((element) => getComputedStyle(element).backgroundColor)
      await preview.getByRole('radio', { name: 'Dark', exact: true }).check()
      await expect
        .poll(() => panel.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe(light)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
    }
  }
  await preview.getByRole('radio', { name: 'Default', exact: true }).check()
  await page.keyboard.press('ArrowRight')
  await expect(preview.getByRole('radio', { name: 'Clubhouse', exact: true })).toBeChecked()
  await expect(preview.getByRole('radio', { name: 'Clubhouse', exact: true })).toBeFocused()
  await context.close()
})

test('the preview takes the site scheme on load and then changes independently', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const preview = page.getByRole('group', { name: 'Preview colour scheme', exact: true })
  const site = page.getByRole('group', { name: 'Colour scheme', exact: true })
  await expect(preview.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked()
  await site.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(preview.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked()
  await page.reload()
  await expect(preview.getByRole('radio', { name: 'Light', exact: true })).toBeChecked()
  await preview.getByRole('radio', { name: 'Dark', exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await site.getByRole('button', { name: 'Dark', exact: true }).click()
  await preview.getByRole('radio', { name: 'Light', exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(preview.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked()
})
