import { expect, test } from '@playwright/test'

import { enterAdminPanel, signUp } from './support/session'
import { screenshotter, sendPaidWebhook } from './support/tour'

const snap = screenshotter('/tmp/dues-shots')

test('the whole journey, photographed', async ({ page, request }) => {
  test.setTimeout(180_000)

  await page.goto('/plugins/dues')
  await snap(page, 'guest-plans')

  const buyer = await signUp(page, 'shopper')
  void buyer
  await page.goto('/plugins/dues')
  await snap(page, 'member-plans')

  const passCard = page.locator('section', {
    has: page.getByRole('heading', { name: '90-day pass' }),
  })
  await passCard.getByRole('button', { name: 'Buy this pass' }).click()
  await expect(page).toHaveURL(/127\.0\.0\.1:12111\/checkout\//)
  const sessionId = page.url().split('/checkout/')[1] as string
  await snap(page, 'stripe-checkout')

  await page.locator('#pay').click()
  await expect(page).toHaveURL(/\/plugins\/dues\/return\?order=\d+$/)
  await snap(page, 'return-confirming')

  await sendPaidWebhook(request, sessionId)
  await page.getByRole('link', { name: 'Check again' }).click()
  await expect(page.getByRole('heading', { name: 'Paid, and done' })).toBeVisible()
  await snap(page, 'return-paid')

  await page.goto('/plugins/dues')
  await expect(page.getByRole('heading', { name: 'What you hold' })).toBeVisible()
  await snap(page, 'member-plans-held')

  await page.goto('/plugins/dues/manage')
  await snap(page, 'manage')

  const recipientPage = await page.context().browser()!.newPage()
  const recipient = await signUp(recipientPage, 'gifted')

  await recipientPage.goto('/plugins/dues')
  await snap(recipientPage, 'recipient-before-gift')

  await page.goto('/plugins/dues')
  const giftCard = page.locator('section', {
    has: page.getByRole('heading', { name: '90-day pass' }),
  })
  await giftCard.getByLabel(/another member/).fill(recipient)
  await snap(page, 'gift-form-filled')
  await giftCard.getByRole('button', { name: 'Buy this pass' }).click()
  await expect(page).toHaveURL(/127\.0\.0\.1:12111\/checkout\//)
  const giftSession = page.url().split('/checkout/')[1] as string
  await snap(page, 'gift-stripe-checkout')
  await page.locator('#pay').click()
  await expect(page).toHaveURL(/\/plugins\/dues\/return\?order=\d+$/)
  await sendPaidWebhook(request, giftSession)

  await page.goto('/plugins/dues/manage')
  await expect(page.getByRole('heading', { name: 'Gifts you bought' })).toBeVisible()
  await snap(page, 'manage-with-gift')

  await recipientPage.goto('/plugins/dues')
  await expect(recipientPage.getByRole('heading', { name: 'What you hold' })).toBeVisible()
  await snap(recipientPage, 'recipient-after-gift')
  await recipientPage.close()

  await enterAdminPanel(page)
  await page.goto('/admin/plugins/dues')
  await snap(page, 'admin-plugin-settings')

  await page.goto('/admin/plugins/dues/status')
  await snap(page, 'admin-status')

  await page.goto('/admin/plugins/dues/members')
  await snap(page, 'admin-members')

  await page.goto('/admin/plugins/dues/ledger')
  await snap(page, 'admin-ledger')

  await page.goto('/admin/users')
  await page.getByRole('link', { name: recipient }).first().click()
  await expect(page.getByRole('heading', { name: 'Additional groups' })).toBeVisible()
  await snap(page, 'admin-user-additional-groups')

  await page.goto('/admin/groups/5001')
  await snap(page, 'admin-supporters-group')
})
