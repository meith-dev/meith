import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('a signature saved in the panel appears under the member’s posts', async ({ page }) => {
  await signUp(page, 'signed')

  const motto = `Sent from my board ${Date.now()}`
  await page.goto('/usercp/signature')
  await page.getByLabel('Signature').fill(motto)
  await page.getByRole('button', { name: 'Save signature' }).click()

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  await page.getByLabel('Subject').fill(`Signature check ${Date.now()}`)
  await page.getByLabel('Message').fill('Look below the fold.')
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)

  await expect(page.getByText(motto)).toBeVisible()
})

test('profile fields saved in the panel appear on the member page', async ({ page }) => {
  const username = await signUp(page, 'aboutme')

  await page.goto('/usercp/profile')
  await page.getByLabel('Location').fill('The test suite')
  await page.getByLabel('About me').fill('I exist to prove the profile round-trips.')
  await page.getByRole('button', { name: 'Save profile' }).click()

  await page.goto(`/member/by-name/${username}`)
  await expect(page).toHaveURL(/\/member\/\d+$/)
  await expect(page.getByText('The test suite')).toBeVisible()
  await expect(page.getByText('I exist to prove the profile round-trips.')).toBeVisible()
})

test('a member edits their own post, and the note says so', async ({ page }) => {
  const username = await signUp(page, 'editor')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  const title = `Second thoughts ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('First thoughts.')
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)
  const threadUrl = page.url()

  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-.+\/edit\?post=\d+$/)

  await page.getByLabel('Message').fill('Second thoughts, on reflection.')
  await page.getByLabel(/reason/i).fill('clarity')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await page.goto(threadUrl)
  await expect(page.getByText('Second thoughts, on reflection.')).toBeVisible()
  await expect(page.getByText('First thoughts.')).toHaveCount(0)
  await expect(page.getByText(new RegExp(`Last edited by ${username} on .*: clarity`))).toBeVisible()
})
