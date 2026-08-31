import { expect, type Page, test } from '@playwright/test'

test.use({ javaScriptEnabled: false })

const THREAD = '/thread/4-welcome-to-the-forum'

const LIGHT = 'oklch(0.45 0.13 155)'
const DARK = 'oklch(0.85 0.14 155)'

async function asRendered(page: Page, declared: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement('span')
    probe.style.color = value
    document.body.append(probe)
    const computed = getComputedStyle(probe).color
    probe.remove()
    return computed
  }, declared)
}

function authorName(page: Page) {
  return page.locator('article').first().getByRole('link', { name: 'admin', exact: true })
}

test("a group's colour reaches the name, and beats the theme's own", async ({ page }) => {
  await page.goto(THREAD)

  const name = authorName(page)
  await expect(name).toBeVisible()

  await expect(name).toHaveCSS('color', await asRendered(page, LIGHT))
})

test('the colour follows the reader into dark mode, chosen or inherited', async ({
  page,
  context,
}) => {
  await context.addCookies([{ name: 'meith_scheme', value: 'dark', url: 'http://127.0.0.1:3001' }])
  await page.goto(THREAD)

  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
  await expect(authorName(page)).toHaveCSS('color', await asRendered(page, DARK))
})

test('the colour follows a reader whose dark mode comes from the operating system', async ({
  browser,
}) => {
  const context = await browser.newContext({
    colorScheme: 'dark',
    javaScriptEnabled: false,
  })
  const page = await context.newPage()
  await page.goto(THREAD)

  await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/)
  await expect(authorName(page)).toHaveCSS('color', await asRendered(page, DARK))

  await context.close()
})

test("the group's title, badge and reputation are in the postbit", async ({ page }) => {
  await page.goto(THREAD)

  const postbit = page.locator('article').first()

  await expect(postbit.getByText('Administrators', { exact: true })).toBeVisible()
  await expect(postbit.getByText(/\d+ reputation/)).toBeVisible()

  const badge = postbit.locator('img[src^="/group/3/badge/"]')
  await expect(badge).toHaveCount(1)

  await expect
    .poll(() => badge.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
})

test('every displayed group is in the postbit, each in its own colour', async ({ page }) => {
  await page.goto(THREAD)

  const postbit = page.locator('article').first()
  const staffTitle = postbit.getByText('Administrators', { exact: true })
  const supportersTitle = postbit.getByText('Supporters', { exact: true })

  await expect(staffTitle).toBeVisible()
  await expect(supportersTitle).toBeVisible()
  await expect(supportersTitle).toHaveCSS('color', await asRendered(page, 'oklch(0.5 0.11 165)'))
})

test('the displayed groups follow the member onto their profile', async ({ page }) => {
  await page.goto('/member/1')

  const heading = page.getByRole('heading', { level: 1, name: 'admin' })
  await expect(heading).toBeVisible()
  await expect(page.getByText('Administrators', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Supporters', { exact: true }).first()).toBeVisible()
})

test('the same member is the same colour in a listing', async ({ page }) => {
  await page.goto('/100-announcements')

  const started = page.getByRole('link', { name: 'admin', exact: true }).first()
  await expect(started).toBeVisible()
  await expect(started).toHaveCSS('color', await asRendered(page, LIGHT))
})
