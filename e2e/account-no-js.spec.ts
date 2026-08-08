/**
 * The account panel's day-to-day edits, in a browser, with JavaScript off.
 *
 * Three journeys that each cross the seam between a panel form and a public
 * page: a signature saved in the panel appearing under a post, profile
 * fields appearing on the member page, and a member editing their own post
 * with the edit owning up to itself in the thread.
 */
import { expect, test, type Page } from '@playwright/test'

test.use({ javaScriptEnabled: false })

const PASSWORD = 'long-enough-password'

/** Register through the form, then sign in. The only way to get a session. */
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

test('a signature saved in the panel appears under the member’s posts', async ({ page }) => {
  await signUp(page, 'signed')

  const motto = `Sent from my board ${Date.now()}`
  await page.goto('/usercp/signature')
  await page.getByLabel('Signature').fill(motto)
  await page.getByRole('button', { name: 'Save signature' }).click()

  /* The proof is under a post, not on the panel. */
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

  /* Edit is a link on the post's own action row. */
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-.+\/edit\?post=\d+$/)

  await page.getByLabel('Message').fill('Second thoughts, on reflection.')
  await page.getByLabel(/reason/i).fill('clarity')
  await page.getByRole('button', { name: 'Save changes' }).click()

  /* The thread carries the new words and owns up to the change, reason included. */
  await page.goto(threadUrl)
  await expect(page.getByText('Second thoughts, on reflection.')).toBeVisible()
  await expect(page.getByText('First thoughts.')).toHaveCount(0)
  await expect(page.getByText(new RegExp(`Last edited by ${username} on .*: clarity`))).toBeVisible()
})
