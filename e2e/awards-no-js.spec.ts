import { expect, test } from '@playwright/test'

import { enterAdminPanel, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('an administrator creates and grants an award visible in the catalogue, profile and postbit', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000)
  const username = await signUp(page, 'awards')
  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  await page.getByLabel('Subject').fill('Recognising community helpers')
  await page.getByLabel('Message', { exact: true }).fill('Glad to be part of this community.')
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\//)
  const threadUrl = page.url()

  await enterAdminPanel(page)
  await page.goto('/admin/plugins/awards/awards')
  await page.getByLabel('Name', { exact: true }).fill('Community helper')
  await page
    .getByLabel('Description', { exact: true })
    .fill('For making this community a welcoming place.')
  await page.getByLabel('Icon', { exact: true }).fill('trophy')
  await page.getByRole('button', { name: 'Save award', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Award saved.')
  await page.goto('/admin/plugins/awards/grant')
  await page
    .getByRole('combobox', { name: 'Award', exact: true })
    .selectOption({ label: 'Community helper' })
  await page.getByLabel('Usernames (comma-separated)').fill(username)
  await page.getByLabel('Reason', { exact: true }).fill('Thank you for helping new members.')
  await page.getByRole('button', { name: 'Grant awards', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Awards granted.')

  await page.goto('/plugins/awards')
  await expect(page.getByRole('link', { name: 'Community helper', exact: true })).toBeVisible()
  await expect(page.getByText('Holders: 1')).toBeVisible()
  await page.getByRole('link', { name: 'Community helper', exact: true }).click()
  await page.getByRole('link', { name: username, exact: true }).click()
  await expect(page.getByText('Thank you for helping new members.')).toBeVisible()

  await page.goto(`/member/by-name/${username}`)
  await expect(page.getByRole('link', { name: 'Community helper', exact: true })).toBeVisible()
  await expect(page.getByText('Thank you for helping new members.')).toBeVisible()
  await page.goto(threadUrl)
  await expect(page.getByRole('link', { name: 'Community helper', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Community helper', exact: true })).toHaveAttribute(
    'title',
    'Community helper',
  )

  const preview = await browser.newContext({
    storageState: await page.context().storageState(),
    javaScriptEnabled: true,
    colorScheme: 'light',
    viewport: { width: 1440, height: 900 },
  })
  try {
    const screenshotPage = await preview.newPage()
    await screenshotPage.goto(new URL('/plugins/awards', page.url()).href)
    await expect(screenshotPage.getByText('Holders: 1')).toBeVisible()
    await expect(screenshotPage.locator('[data-account="plain"]')).toBeHidden()
    await screenshotPage.getByRole('button', { name: 'Your account', exact: true }).click()
    await expect(screenshotPage.getByRole('menu')).toBeVisible()
    await expect(
      screenshotPage.getByRole('menuitem', { name: 'Profile', exact: true }),
    ).toBeVisible()
    await screenshotPage.keyboard.press('Escape')
    await expect(screenshotPage.getByRole('menu')).toBeHidden()
    await screenshotPage.evaluate(() => document.fonts.ready)
    await screenshotPage.screenshot({
      path: testInfo.outputPath('awards-light.png'),
      fullPage: true,
      animations: 'disabled',
    })
  } finally {
    await preview.close()
  }
})
