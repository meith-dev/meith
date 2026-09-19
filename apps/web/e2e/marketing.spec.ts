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
  '/marketplace',
  '/marketplace/default',
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
  await page.getByRole('button', { name: 'Colour scheme: system. Switch to light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Colour scheme: light. Switch to dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.goto('/about')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Colour scheme: dark. Switch to system' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Colour scheme: system. Switch to light' }),
  ).toBeVisible()
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
  await page.getByRole('button', { name: /^Colour scheme:/ }).click()
  await expect(navigation).toBeHidden()

  await menu.click()
  await navigation.getByRole('link', { name: 'Who it’s for', exact: true }).click()
  await expect(page).toHaveURL(/\/who-its-for$/)
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
    ['Docs', '/docs'],
  ] as const) {
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
  }
  await expect(nav.getByRole('link', { name: /^Community/ })).toHaveAttribute(
    'href',
    /^https:\/\/forum\./,
  )

  const customise = page.getByRole('navigation', { name: 'Customise Meith', exact: true })
  for (const [name, href] of [
    ['Build a theme', '/docs/themes'],
    ['Extend with plugins', '/docs/plugins'],
    ['Browse extensions', '/marketplace'],
  ] as const) {
    await expect(customise.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
  }

  const audiences = [
    { name: /^Developers/, slug: 'developers' },
    { name: /^Open-source projects/, slug: 'open-source' },
    { name: /^Communities/, slug: 'communities' },
    { name: /^Clubs & associations/, slug: 'clubs-and-associations' },
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
