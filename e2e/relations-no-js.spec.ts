import { expect, test, type Page } from '@playwright/test'

test.use({ javaScriptEnabled: false })

const PASSWORD = 'long-enough-password'

async function signUp(page: Page, label: string): Promise<string> {
  const username = `e2e_${label}_${Date.now()}_${Math.floor(Math.random() * 1000)}`

  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login\?registered=1$/)

  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')

  return username
}

test('a buddy added from a profile is listed with a message link, and removed again', async ({
  browser,
}) => {
  const memberContext = await browser.newContext()
  const buddyContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  const buddyPage = await buddyContext.newPage()

  try {
    const buddy = await signUp(buddyPage, 'buddy')
    await signUp(memberPage, 'member')

    await memberPage.goto(`/member/by-name/${buddy}`)
    await expect(memberPage).toHaveURL(/\/member\/\d+$/)
    await memberPage.getByRole('button', { name: 'Add to buddy list' }).click()

    await expect(
      memberPage.getByRole('button', { name: 'Remove from buddy list' }),
    ).toBeVisible()

    await memberPage.goto('/usercp/contacts')
    const line = memberPage.locator('li', { hasText: buddy })
    await expect(line).toBeVisible()
    await expect(line.getByRole('link', { name: 'Message' })).toHaveAttribute(
      'href',
      `/messages/compose?to=${buddy}`,
    )

    await line.getByRole('button', { name: 'Remove' }).click()
    await expect(memberPage.getByText('Nobody yet.')).toBeVisible()
  } finally {
    await memberContext.close()
    await buddyContext.close()
  }
})

test('an ignored member’s posts hide behind a link, and their messages are refused', async ({
  browser,
}) => {
  const readerContext = await browser.newContext()
  const ignoredContext = await browser.newContext()
  const readerPage = await readerContext.newPage()
  const ignoredPage = await ignoredContext.newPage()

  try {
    const ignored = await signUp(ignoredPage, 'ignored')
    const reader = await signUp(readerPage, 'reader')

    await ignoredPage.goto('/200-general')
    await ignoredPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Ignore me end to end ${Date.now()}`
    await ignoredPage.getByLabel('Subject').fill(title)
    await ignoredPage.getByLabel('Message').fill('Words the reader chose not to see.')
    await ignoredPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(ignoredPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = ignoredPage.url()

    await readerPage.goto(`/member/by-name/${ignored}`)
    await readerPage.getByRole('button', { name: 'Ignore this member' }).click()
    await expect(readerPage.getByRole('button', { name: 'Stop ignoring' })).toBeVisible()

    await readerPage.goto(threadUrl)
    await expect(readerPage.getByText(`You are ignoring`)).toBeVisible()
    await expect(readerPage.getByText('Words the reader chose not to see.')).toHaveCount(0)

    await readerPage.getByRole('link', { name: 'Show it anyway' }).click()
    await expect(readerPage.getByText('Words the reader chose not to see.')).toBeVisible()

    await ignoredPage.goto('/messages/compose')
    await ignoredPage.locator('input[name="to"]').fill(reader)
    await ignoredPage.getByLabel('Subject').fill('Hello?')
    await ignoredPage.getByLabel('Message').fill('You cannot ignore me.')
    await ignoredPage.getByRole('button', { name: 'Send message' }).click()
    await expect(
      ignoredPage.getByText(`${reader} cannot receive private messages.`),
    ).toBeVisible()

    await readerPage.goto('/messages')
    await expect(readerPage.locator('li', { hasText: 'Hello?' })).toHaveCount(0)
  } finally {
    await readerContext.close()
    await ignoredContext.close()
  }
})
