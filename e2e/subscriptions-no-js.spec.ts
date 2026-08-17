import { expect, test } from '@playwright/test'

import { drainUntil, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('the composer’s subscribe box lands the thread on the subscriptions screen', async ({
  page,
}) => {
  await signUp(page, 'subw')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  const title = `Followed from birth ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('Subscribed at the moment of posting.')
  await page.getByLabel('Notify me of replies').check()
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)

  await page.goto('/subscriptions')
  const row = page.locator('li', { hasText: title })
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: 'Stop following' }).click()
  await expect(page.getByText('You are not following anything yet.')).toBeVisible()
})

test('a follower is notified of a reply once the queue has run', async ({ browser, request }) => {
  test.setTimeout(150_000)

  const authorContext = await browser.newContext()
  const followerContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  const followerPage = await followerContext.newPage()

  try {
    await signUp(authorPage, 'suba')
    await signUp(followerPage, 'subf')

    await authorPage.goto('/200-general')
    await authorPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Worth following ${Date.now()}`
    await authorPage.getByLabel('Subject').fill(title)
    await authorPage.getByLabel('Message').fill('Follow this and see.')
    await authorPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(authorPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = authorPage.url()

    await followerPage.goto(threadUrl)
    await followerPage.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(followerPage.getByRole('button', { name: 'Stop following' })).toBeVisible()

    await followerPage.goto('/200-general')
    await followerPage.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(followerPage.getByRole('button', { name: 'Stop following' })).toBeVisible()

    await followerPage.goto('/subscriptions')
    await expect(followerPage.locator('li', { hasText: title })).toBeVisible()

    await authorPage.goto(`${threadUrl}/reply`)
    await authorPage.getByLabel('Message').fill('Here is the reply you followed for.')
    await authorPage.getByRole('button', { name: 'Post reply' }).click()
    await expect(authorPage).toHaveURL(/#post-\d+$/)

    await drainUntil(request, followerPage, '/notifications', async () => {
      await expect(followerPage.locator('li', { hasText: `New reply in ${title}` })).toBeVisible()
    })
  } finally {
    await authorContext.close()
    await followerContext.close()
  }
})
