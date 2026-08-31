import { expect, test } from '@playwright/test'

test.use({ javaScriptEnabled: false })

test('the member list names everyone, with their displayed groups beside them', async ({
  page,
}) => {
  await page.goto('/members')

  const adminRow = page.locator('li', {
    has: page.getByRole('link', { name: 'admin', exact: true }),
  })
  await expect(adminRow).toBeVisible()
  await expect(adminRow.getByText('Administrators', { exact: true })).toBeVisible()
  await expect(adminRow.getByText('Supporters', { exact: true })).toBeVisible()

  await expect(page.getByRole('link', { name: 'wellwisher', exact: true })).toBeVisible()
})

test('the member list narrows to a searched name', async ({ page }) => {
  await page.goto('/members?name=wellwish')

  await expect(page.getByRole('link', { name: 'wellwisher', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'admin', exact: true })).toHaveCount(0)
})

test('the staff page holds the staff groups and who is in them, and nobody else', async ({
  page,
}) => {
  await page.goto('/staff')

  const admins = page.locator('section[aria-label="Administrators"]')
  await expect(admins.getByText('Administrators', { exact: true })).toBeVisible()
  await expect(admins.getByRole('link', { name: 'admin', exact: true })).toBeVisible()

  const supermods = page.locator('section[aria-label="Super Moderators"]')
  await expect(supermods.getByRole('link', { name: 'e2e_moderator', exact: true })).toBeVisible()

  await expect(page.getByRole('link', { name: 'wellwisher', exact: true })).toHaveCount(0)
})

test('both pages are one click from the board navigation', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('link', { name: 'Members', exact: true }).first().click()
  await expect(page).toHaveURL(/\/members$/)

  await page.getByRole('link', { name: 'Staff', exact: true }).first().click()
  await expect(page).toHaveURL(/\/staff$/)
})
