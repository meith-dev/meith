import { expect, test } from '@playwright/test'

test.use({ javaScriptEnabled: false })

test('the fixture board, registration, and login work without JavaScript', async ({ page }, testInfo) => {
  const username = `e2e_member_${testInfo.workerIndex}_${Date.now()}`
  const password = 'long-enough-password'

  await page.goto('/')
  await page.getByLabel('Main').getByRole('link', { name: 'Version 0.1 is live' }).click()
  await expect(page).toHaveURL(/\/thread\/4(?:#|$)/)

  await expect(page.locator('#post-10 strong')).toHaveText('new forum')
  const rules = page.locator('#post-10 a[href="/100-announcements"]')
  await expect(rules).toHaveText('Announcements')
  await expect(rules).toHaveAttribute('rel', 'nofollow ugc noopener noreferrer')

  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(password)
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

  const quote = page.locator('#post-132 blockquote.md-quote')
  await expect(quote).toContainText('admin wrote:')
  await expect(quote).toContainText('Show us the place where you make things.')
  await expect(page.locator('#post-132')).not.toContainText('> **admin')
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
  await expect(rail.locator('section', { hasText: 'Latest threads' }).locator('li')).not.toHaveCount(
    0,
  )

  await expect(page.getByRole('region', { name: 'Board statistics' })).toBeAttached()
  await expect(page.getByRole('region', { name: 'Who’s online' })).toBeAttached()
  await expect(rail.getByRole('region', { name: 'Board statistics' })).toHaveCount(0)
  await expect(rail.getByRole('region', { name: 'Who’s online' })).toHaveCount(0)

  await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0)

  const post = rail.locator('section', { hasText: 'Latest posts' }).locator('li a').first()
  await expect(post).toHaveAttribute('href', /\/thread\/\d+-[^?]+\?post=\d+#post-\d+$/)
})
