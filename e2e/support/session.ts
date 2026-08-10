import { expect, type APIRequestContext, type Page } from '@playwright/test'

import { STAFF, STAFF_PASSWORD } from './config'

export const PASSWORD = 'long-enough-password'

const USERNAME_MAX = 30

let minted = 0

export async function signUp(page: Page, label: string): Promise<string> {
  const username = `e2e_${label}_${Date.now().toString(36)}${(minted++).toString(36)}`

  expect(
    username.length,
    `${username} is longer than the board allows, so the form would truncate it`,
  ).toBeLessThanOrEqual(USERNAME_MAX)

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

export async function signIn(page: Page, username: string, password = PASSWORD): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
}

export async function signInAsModerator(page: Page): Promise<string> {
  await signIn(page, STAFF.moderator.username, STAFF_PASSWORD)
  return STAFF.moderator.username
}

export async function signInAsAdmin(page: Page): Promise<string> {
  await signIn(page, STAFF.admin.username, STAFF_PASSWORD)
  return STAFF.admin.username
}

export async function enterAdminPanel(page: Page): Promise<void> {
  await signInAsAdmin(page)

  await page.goto('/admin')
  await page.getByLabel('Password').fill(STAFF_PASSWORD)
  await page.getByRole('button', { name: 'Enter the control panel' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
}

export async function drainUntil(
  request: APIRequestContext,
  page: Page,
  url: string,
  check: () => Promise<void>,
): Promise<void> {
  await expect(async () => {
    await request.get('/api/system/tick?secret=e2e-only-tick-secret-000000000000')
    await page.goto(url)
    await check()
  }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 5_000, 10_000] })
}
