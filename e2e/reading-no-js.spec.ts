import { expect, test } from '@playwright/test'

import { enterAdminPanel, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('the fixture board, registration, and login work without JavaScript', async ({
  page,
}, testInfo) => {
  const username = `e2e_member_${testInfo.workerIndex}_${Date.now()}`
  const password = 'long-enough-password'

  await page.goto('/')
  await page.getByLabel('Main').getByRole('link', { name: 'Version 0.1 is live' }).click()
  await expect(page).toHaveURL(/\/thread\/4-version-0-1-is-live#post-\d+$/)

  await expect(page.locator('#post-1 strong')).toHaveText('new forum')
  const rules = page.locator('#post-1 a[href="/100-announcements"]')
  await expect(rules).toHaveText('Announcements')
  await expect(rules).toHaveAttribute('rel', 'nofollow ugc noopener noreferrer')

  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(password)
  await page.getByLabel(/I have read and accept/).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login\?registered=1$/)
  await expect(page.getByText('Account created. You can sign in now.')).toBeVisible()

  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
})

test('a quoted reply renders as a quote block, not as its own markup', async ({ page }) => {
  await page.goto('/thread/21-show-us-your-desk-setup')

  const quote = page.locator('#post-2 blockquote.md-quote')
  await expect(quote).toContainText('admin wrote:')
  await expect(quote).toContainText('Show us the place where you make things.')
  await expect(page.locator('#post-2')).not.toContainText('> **admin')

  await expect(quote.locator('a.md-quote-author')).toHaveAttribute('href', '/member/by-name/admin')
  await expect(quote.locator('a.md-quote-source')).toHaveAttribute(
    'href',
    '/thread/21-show-us-your-desk-setup?post=121',
  )
})

test('a post is linked by its number, and a link by id lands on it', async ({ page }) => {
  await page.goto('/thread/21-show-us-your-desk-setup')

  const second = page.locator('#post-2')
  await expect(second.getByRole('link', { name: /#2/ })).toHaveAttribute(
    'href',
    '/thread/21-show-us-your-desk-setup#post-2',
  )

  await page.goto('/thread/21-show-us-your-desk-setup?post=132')
  await expect(page).toHaveURL('/thread/21-show-us-your-desk-setup#post-2')
  await expect(second).toBeInViewport()
})

test('a category in the breadcrumb is a page, not a 404', async ({ page }) => {
  await page.goto('/200-general')

  const section = page.getByLabel('Breadcrumb').getByRole('link', { name: 'Main' })
  await expect(section).toHaveAttribute('href', '/10-main')

  await section.click()
  await expect(page).toHaveURL('/10-main')
  await expect(page.getByRole('heading', { name: 'Main' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'General Discussion', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Announcements', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Off Topic', exact: true })).toBeVisible()
})

test('the forum jump box works without JavaScript', async ({ page }) => {
  await page.goto('/')

  const jump = page.getByRole('combobox', { name: 'Jump to forum' })
  await expect(jump).toBeVisible()

  await expect(jump.locator('option[disabled]')).not.toHaveCount(0)

  await expect(jump.locator('option[value="100"]')).toHaveText(/Announcements/)
  await jump.selectOption('100')
  await page.getByRole('button', { name: 'Go' }).click()

  await expect(page).toHaveURL(/\/100-announcements/)
})

test('the jump box is reachable and operable from the keyboard', async ({ page }) => {
  await page.goto('/')

  const jump = page.getByRole('combobox', { name: 'Jump to forum' })
  await jump.focus()
  await expect(jump).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Go' })).toBeFocused()
})

test('jumping to a forum id that does not exist is a 404, not a redirect', async ({ page }) => {
  const response = await page.goto('/jump?forum=99999')
  expect(response?.status()).toBe(404)
  expect(response?.headers()['content-type']).toContain('text/html')
  expect(await response?.text()).not.toBe('')
})

test('a legacy MyBB URL 404s with a page, not an empty response', async ({ page }) => {
  for (const url of ['/showthread.php?tid=1', '/forumdisplay.php?fid=1', '/member.php?uid=1']) {
    const response = await page.goto(url)
    expect(response?.status(), url).toBe(404)
    expect(response?.headers()['content-type'], url).toContain('text/html')
    expect(await response?.text(), url).not.toBe('')
  }
})

test('jumping with no selection goes to the index rather than erroring', async ({ page }) => {
  await page.goto('/jump')
  await expect(page).toHaveURL(/\/$/)
})

test('the index rail renders, and only its pause control needs JavaScript', async ({ page }) => {
  await page.goto('/')

  const rail = page.getByRole('complementary', { name: 'Board activity' })
  await expect(rail).toBeVisible()

  await expect(rail.getByRole('heading', { name: 'Latest threads' })).toBeVisible()
  await expect(rail.getByRole('heading', { name: 'Latest posts' })).toBeVisible()
  await expect(
    rail.locator('section', { hasText: 'Latest threads' }).locator('li'),
  ).not.toHaveCount(0)

  await expect(rail.getByRole('region', { name: 'Board statistics' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Who’s online' })).toBeAttached()
  await expect(rail.getByRole('region', { name: 'Who’s online' })).toHaveCount(0)

  await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0)

  const post = rail.locator('section', { hasText: 'Latest posts' }).locator('li a').first()
  await expect(post).toHaveAttribute('href', /\/thread\/\d+-[^?]+\?post=\d+$/)
})

test('a category takes threads once an admin turns them on', async ({ browser }) => {
  const staff = await browser.newContext({ javaScriptEnabled: false })
  const admin = await staff.newPage()
  const readerContext = await browser.newContext({ javaScriptEnabled: false })
  const reader = await readerContext.newPage()

  async function allowThreads(on: boolean): Promise<void> {
    await admin.goto('/admin/forums')
    await admin.getByRole('link', { name: 'Options for Main' }).click()
    const box = admin.getByLabel('Allow new threads')
    if (on) await box.check()
    else await box.uncheck()
    await admin.getByRole('button', { name: 'Save forum' }).click()
    await expect(admin.getByText('Saved.')).toBeVisible()
  }

  try {
    await signUp(reader, 'sections')

    await reader.goto('/10-main')
    await expect(reader.getByText('No threads here yet')).toHaveCount(0)
    await expect(reader.getByRole('link', { name: 'New thread' })).toHaveCount(0)
    await expect(
      reader.getByRole('link', { name: 'General Discussion', exact: true }),
    ).toBeVisible()

    await enterAdminPanel(admin)
    await allowThreads(true)

    await reader.goto('/10-main')
    await expect(reader.getByText('No threads here yet')).toBeVisible()
    await expect(reader.getByRole('link', { name: 'New thread' })).toBeVisible()
    await expect(
      reader.getByRole('link', { name: 'General Discussion', exact: true }),
    ).toBeVisible()

    await allowThreads(false)
    await reader.goto('/10-main')
    await expect(reader.getByText('No threads here yet')).toHaveCount(0)
    await expect(reader.getByRole('link', { name: 'New thread' })).toHaveCount(0)
  } finally {
    await staff.close()
    await readerContext.close()
  }
})
