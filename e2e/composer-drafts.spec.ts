import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

const BACKUP_KEY = 'meith:composer:new-thread:200'

test('posting a thread clears the browser copy, so the next one starts empty', async ({ page }) => {
  test.setTimeout(60_000)

  await signUp(page, 'drafter')

  await page.goto('/200-general/new')

  const title = `A thread that autosaved ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('This one was autosaved before it was posted.')

  await expect(page.getByText('Saved just now.')).toBeVisible()
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), BACKUP_KEY))
    .not.toBeNull()

  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()

  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), BACKUP_KEY)).toBeNull()

  await page.goto('/200-general/new')

  await expect(page.getByLabel('Subject')).toHaveValue('')
  await expect(
    page.getByText('A newer unsent version was recovered from this browser.'),
  ).toHaveCount(0)
})

test('a saved thread draft is listed, resumes with its text, and can be deleted', async ({
  page,
}) => {
  test.setTimeout(60_000)

  await signUp(page, 'draftlist')

  await page.goto('/200-general/new')
  await page.getByLabel('Subject').fill('Never quite finished')
  await expect(page.getByText('Saved just now.')).toBeVisible()

  await page.getByLabel('Message').fill('I meant to come back to this.')
  await page.waitForTimeout(2_000)
  await expect(page.getByText('Saved just now.')).toBeVisible()

  await page.waitForLoadState('load')
  await page.goto('/usercp')
  await page.getByRole('complementary').getByRole('link', { name: 'Drafts' }).click()
  await expect(page).toHaveURL(/\/usercp\/drafts$/)

  const row = page.getByRole('listitem').filter({ hasText: 'General' })
  await expect(row).toBeVisible()

  await row.getByRole('link', { name: 'Resume' }).click()
  await expect(page).toHaveURL(/\/200-general\/new$/)
  await expect(page.getByLabel('Message')).toHaveValue('I meant to come back to this.')

  await page.waitForLoadState('load')
  await page.goto('/usercp/drafts')
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()

  await expect(page).toHaveURL(/\/usercp\/drafts$/)
  await expect(page.getByText('You have no saved drafts.')).toBeVisible()
})
