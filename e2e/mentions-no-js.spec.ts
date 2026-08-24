import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('a reply that quotes one member and mentions another notifies both', async ({ browser }) => {
  const quotedContext = await browser.newContext()
  const mentionedContext = await browser.newContext()
  const posterContext = await browser.newContext()
  const quotedPage = await quotedContext.newPage()
  const mentionedPage = await mentionedContext.newPage()
  const posterPage = await posterContext.newPage()

  try {
    const mentioned = await signUp(mentionedPage, 'named')
    const quoted = await signUp(quotedPage, 'quoted')

    await quotedPage.goto('/200-general')
    await quotedPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Mentions end to end ${Date.now()}`
    await quotedPage.getByLabel('Subject').fill(title)
    await quotedPage.getByLabel('Message').fill('A post worth quoting.')
    await quotedPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(quotedPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = quotedPage.url()

    const poster = await signUp(posterPage, 'poster')
    await posterPage.goto(threadUrl)
    await posterPage.locator('a[href*="?quote="]').first().click()

    const prefilled = await posterPage.getByLabel('Message').inputValue()
    expect(prefilled).toContain(`> **[${quoted}](/member/by-name/${quoted}) wrote:**`)

    await posterPage
      .getByLabel('Message')
      .fill(`${prefilled}\n\nAgreed — and @${mentioned} should see this too.`)
    await posterPage.getByRole('button', { name: 'Post reply' }).click()
    await expect(posterPage).toHaveURL(/#post-\d+$/)

    const mention = posterPage.locator('a.md-mention')
    await expect(mention).toHaveText(`@${mentioned}`)
    await expect(mention).toHaveAttribute('href', `/member/by-name/${mentioned}`)
    await mention.click()
    await expect(posterPage).toHaveURL(/\/member\/\d+$/)
    await expect(posterPage.locator('main')).toContainText(mentioned)

    await quotedPage.goto('/notifications')
    const quotedRow = quotedPage.locator('li', {
      hasText: `${poster} quoted your post in ${title}`,
    })
    await expect(quotedRow).toBeVisible()
    await expect(quotedRow.getByText('New', { exact: true })).toBeVisible()

    await mentionedPage.goto('/notifications')
    const mentionedRow = mentionedPage.locator('li', {
      hasText: `${poster} mentioned you in ${title}`,
    })
    await expect(mentionedRow).toBeVisible()

    await expect(quotedPage.locator('li', { hasText: 'mentioned you' })).toHaveCount(0)
    await expect(mentionedPage.locator('li', { hasText: 'quoted your post' })).toHaveCount(0)

    const viewHref = await mentionedRow
      .getByRole('link', { name: 'View', exact: true })
      .getAttribute('href')
    expect(viewHref).toMatch(/^\/thread\/\d+-.+\?post=\d+$/)
    await mentionedPage.goto(viewHref!)
    await expect(mentionedPage.getByText(`@${mentioned} should see this too`)).toBeVisible()
  } finally {
    await quotedContext.close()
    await mentionedContext.close()
    await posterContext.close()
  }
})
