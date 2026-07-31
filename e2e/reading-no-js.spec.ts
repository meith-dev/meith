import { expect, test } from '@playwright/test'

test.use({ javaScriptEnabled: false })

test('the fixture board, registration, and login work without JavaScript', async ({ page }, testInfo) => {
  const username = `e2e_member_${testInfo.workerIndex}_${Date.now()}`
  const password = 'long-enough-password'

  await page.goto('/')
  await page.getByRole('link', { name: 'Version 0.1 is live' }).click()
  await expect(page).toHaveURL(/\/thread\/4(?:#|$)/)

  /*
   * F36 in the browser, and specifically through the *live* render path: the
   * fixture board stores no rendered HTML, so what is on screen here was
   * produced by `@forum/bbcode` while the page was being rendered. Asserting
   * the tags rather than the words is the point — a renderer that emitted its
   * input verbatim would still show the sentence.
   */
  await expect(page.locator('#post-10 strong')).toHaveText('new forum')
  const rules = page.locator('#post-10 a[href="/forum/100-announcements"]')
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

  const quote = page.locator('#post-132 blockquote.bb-quote')
  await expect(quote.locator('cite')).toHaveText('admin wrote:')
  await expect(quote).toContainText('Show us the place where you make things.')
  await expect(page.locator('#post-132')).not.toContainText('[quote')
})
