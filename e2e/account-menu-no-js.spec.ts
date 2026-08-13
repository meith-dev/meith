import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('an unread count is a link to the thing that is unread', async ({ browser }) => {
  const posterContext = await browser.newContext()
  const namedContext = await browser.newContext()
  const posterPage = await posterContext.newPage()
  const namedPage = await namedContext.newPage()

  try {
    const named = await signUp(namedPage, 'amnamed')
    await signUp(posterPage, 'amposter')

    await posterPage.goto('/200-general')
    await posterPage.getByRole('link', { name: 'New thread' }).click()
    await posterPage.getByLabel('Subject').fill(`Account menu ${Date.now()}`)
    await posterPage
      .getByLabel('Message')
      .fill(`Summoning @${named} so the header has something to count.`)
    await posterPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(posterPage).toHaveURL(/\/thread\/\d+-/)

    await namedPage.goto('/')

    // The count itself is the link. A badge with no href announces work and
    // then leaves the reader to go and find it, which is what this used to do.
    const unread = namedPage.getByRole('link', { name: /unread notifications/ })
    await expect(unread).toBeVisible()
    await expect(unread).toHaveAttribute('href', '/notifications')

    await unread.click()
    await expect(namedPage).toHaveURL('/notifications')
  } finally {
    await posterContext.close()
    await namedContext.close()
  }
})
