import { expect, test } from '@playwright/test'

import { PASSWORD } from './support/session'

test.use({ javaScriptEnabled: false })

test('the footer links both documents, and each one reads', async ({ page }) => {
  await page.goto('/')

  const footer = page.getByRole('navigation', { name: 'Footer' })
  await expect(footer.getByRole('link', { name: 'Terms' })).toBeVisible()
  await expect(footer.getByRole('link', { name: 'Privacy' })).toBeVisible()

  await footer.getByRole('link', { name: 'Terms' }).click()
  await expect(page).toHaveURL('/terms')
  await expect(page.getByRole('heading', { name: 'Terms of service' })).toBeVisible()

  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What is collected' })).toBeVisible()
})

test('registration refuses the account until the terms are accepted', async ({ page }) => {
  const username = `e2e_terms_${Date.now().toString(36)}`

  await page.goto('/register')

  const accept = page.getByLabel(/I have read and accept/)
  await expect(accept).not.toBeChecked()
  await expect(page.getByRole('link', { name: 'Terms of service' })).toHaveAttribute(
    'href',
    '/terms',
  )

  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).not.toHaveURL(/registered=1/)
  await expect(page.getByText(/tick the box to accept it/)).toBeVisible()

  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByLabel(/I have read and accept/).check()
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/login\?registered=1$/)
})
