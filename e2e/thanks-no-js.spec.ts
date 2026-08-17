import { expect, type Page, test } from '@playwright/test'

test.use({ javaScriptEnabled: false })

const PASSWORD = 'long-enough-password'
const THREAD = '/thread/4-welcome-to-the-forum'

async function signIn(page: Page): Promise<string> {
  const username = `e2e_thanks_${Date.now()}_${Math.floor(Math.random() * 1000)}`

  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByLabel(/I have read and accept/).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login\?registered=1$/)

  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')

  return username
}

function thanks(page: Page) {
  return page
    .locator('article')
    .first()
    .getByRole('button', { name: /Thanks|Thanked/ })
}

test('a member thanks a post, and can take it back', async ({ page }) => {
  await signIn(page)
  await page.goto(THREAD)

  const button = thanks(page)
  await expect(button).toHaveText(/Thanks/)
  await expect(button).toHaveAttribute('aria-pressed', 'false')

  await button.click()

  await expect(thanks(page)).toHaveText(/Thanked/)
  await expect(thanks(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(thanks(page)).toContainText('1')

  await thanks(page).click()
  await expect(thanks(page)).toHaveText(/Thanks/)
  await expect(thanks(page)).toHaveAttribute('aria-pressed', 'false')
})

test('a thanks moves the author’s reputation', async ({ page }) => {
  await signIn(page)
  await page.goto(THREAD)

  const postbit = page.locator('article').first()
  await expect(postbit.getByText(/1 reputation/)).toBeVisible()

  await thanks(page).click()

  await expect(
    page
      .locator('article')
      .first()
      .getByText(/2 reputation/),
  ).toBeVisible()
})

test('pressing it returns the reader to the post they pressed', async ({ page }) => {
  await signIn(page)
  await page.goto(THREAD)

  const second = page.locator('article').nth(1)
  await second.getByRole('button', { name: /Thanks/ }).click()

  await expect(page).toHaveURL(/#post-\d+$/)
})

test('there is no Thanks button on your own post', async ({ page }) => {
  const username = await signIn(page)

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  await page.getByLabel('Subject').fill(`A thread of my own ${Date.now()}`)
  await page.getByLabel('Message').fill('Nobody should be able to thank me for this.')
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)

  const mine = page.locator('article').first()
  await expect(mine.getByText(username, { exact: true }).first()).toBeVisible()
  await expect(mine.getByRole('button', { name: /Thanks|Thanked/ })).toHaveCount(0)
})

test('the Rate link gives way to the button on a thanks-only board', async ({ page }) => {
  await signIn(page)
  await page.goto(THREAD)

  await expect(thanks(page)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rate' })).toHaveCount(0)
})

test('a guest sees no Thanks button', async ({ page }) => {
  await page.goto(THREAD)
  await expect(page.getByRole('button', { name: /Thanks|Thanked/ })).toHaveCount(0)
})
