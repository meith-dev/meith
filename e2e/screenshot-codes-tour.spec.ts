import { expect, test } from '@playwright/test'

import { enterAdminPanel, signUp } from './support/session'
import { screenshotter, sendPaidWebhook } from './support/tour'

const snap = screenshotter('/tmp/dues-admin-shots')

test('discount codes and the admin desk, photographed', async ({ page, request }) => {
  test.setTimeout(180_000)

  await enterAdminPanel(page)

  await page.goto('/admin/plugins/dues/codes')
  await snap(page, 'admin-codes-empty')

  await page.getByLabel(/leave empty to have one invented/).fill('LAUNCH50')
  await page.getByLabel(/Percent off/).fill('50')
  await page.getByLabel(/Redemption cap/).fill('10')
  await snap(page, 'admin-mint-form-filled')
  await page.getByRole('button', { name: 'Mint the code' }).click()
  await expect(page.getByText('The code is live:')).toBeVisible()
  await snap(page, 'admin-code-created')

  const buyerPage = await page.context().browser()!.newPage()
  const buyer = await signUp(buyerPage, 'shopper')
  await buyerPage.goto('/plugins/dues')
  const passCard = buyerPage.locator('section', {
    has: buyerPage.getByRole('heading', { name: '90-day pass' }),
  })
  await passCard.getByLabel(/Discount code/).fill('LAUNCH50')
  await snap(buyerPage, 'member-code-entered')
  await passCard.getByRole('button', { name: 'Buy this pass' }).click()

  await expect(buyerPage).toHaveURL(/127\.0\.0\.1:12111\/checkout\//)
  await expect(buyerPage.getByText('600 gbp')).toBeVisible()
  const sessionId = buyerPage.url().split('/checkout/')[1] as string
  await snap(buyerPage, 'stripe-checkout-half-price')

  await buyerPage.locator('#pay').click()
  await expect(buyerPage).toHaveURL(/\/plugins\/dues\/return\?order=\d+$/)
  await sendPaidWebhook(request, sessionId, 600)
  await buyerPage.getByRole('link', { name: 'Check again' }).click()
  await expect(buyerPage.getByRole('heading', { name: 'Paid, and done' })).toBeVisible()
  await snap(buyerPage, 'member-paid-half-price')

  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByRole('heading', { name: 'What you hold' })).toBeVisible()
  await snap(buyerPage, 'member-holds')

  await page.goto('/admin/plugins/dues/codes')
  await expect(page.getByRole('cell', { name: '1 of 10' })).toBeVisible()
  await snap(page, 'admin-codes-one-redeemed')

  await page.goto('/admin/plugins/dues/ledger')
  await snap(page, 'admin-ledger-discounted-charge')

  await page.goto('/admin/plugins/dues/members')
  await snap(page, 'admin-members-desk')

  const buyerRow = page.getByRole('row').filter({ hasText: buyer })
  await buyerRow.getByLabel(/Days to extend/).fill('30')
  await buyerRow.getByRole('button', { name: 'Extend' }).click()
  await expect(page.getByText('Membership extended')).toBeVisible()
  await snap(page, 'admin-extended-30-days')

  await page.goto('/admin/plugins/dues/codes')
  await page.getByRole('button', { name: 'Switch off' }).click()
  await expect(page.getByText('is switched off')).toBeVisible()
  await snap(page, 'admin-code-switched-off')

  await buyerPage.goto('/plugins/dues')
  const retryCard = buyerPage.locator('section', {
    has: buyerPage.getByRole('heading', { name: '90-day pass' }),
  })
  await retryCard.getByLabel(/Discount code/).fill('LAUNCH50')
  await retryCard.getByRole('button', { name: 'Buy this pass' }).click()
  await expect(buyerPage.getByText('switched off')).toBeVisible()
  await snap(buyerPage, 'member-code-refused')

  await page.goto('/admin/plugins/dues/members')
  const revokeRow = page.getByRole('row').filter({ hasText: buyer })
  await revokeRow.getByRole('button', { name: 'Revoke now' }).click()
  await expect(page.getByText('Membership revoked')).toBeVisible()
  await snap(page, 'admin-revoked')

  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByRole('heading', { name: 'What you hold' })).toHaveCount(0)
  await snap(buyerPage, 'member-after-revoke')
  await buyerPage.close()
})
