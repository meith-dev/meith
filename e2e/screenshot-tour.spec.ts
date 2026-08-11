import { createHmac } from 'node:crypto'
import { mkdirSync } from 'node:fs'

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { E2E_DUES_WEBHOOK_SECRET } from './support/config'
import { enterAdminPanel, signUp } from './support/session'

const SHOTS = '/tmp/dues-shots'
mkdirSync(SHOTS, { recursive: true })

let shot = 0
async function snap(page: Page, name: string): Promise<void> {
  shot += 1
  await page.screenshot({
    path: `${SHOTS}/${String(shot).padStart(2, '0')}-${name}.png`,
    fullPage: true,
  })
}

async function sendPaidWebhook(request: APIRequestContext, sessionId: string): Promise<void> {
  const body = JSON.stringify({
    id: `evt_shot_${Date.now()}_${shot}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status: 'paid',
        amount_total: 1200,
        currency: 'gbp',
        subscription: null,
        payment_intent: `pi_${sessionId}`,
        customer: 'cus_e2e',
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const mac = createHmac('sha256', E2E_DUES_WEBHOOK_SECRET)
  mac.update(`${timestamp}.${body}`, 'utf8')
  const response = await request.post('/api/plugins/dues/hook/stripe', {
    data: body,
    headers: {
      'content-type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${mac.digest('hex')}`,
    },
  })
  expect(response.status()).toBe(200)
}

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

  // The gift: a second member exists, the shopper buys for them by name.
  const recipientPage = await page.context().browser()!.newPage()
  const recipient = await signUp(recipientPage, 'gifted')

  await recipientPage.goto('/plugins/dues')
  await snap(recipientPage, 'recipient-before-gift')

  await page.goto('/plugins/dues')
  const giftCard = page.locator('section', {
    has: page.getByRole('heading', { name: '90-day pass' }),
  })
  await giftCard.getByRole('textbox').fill(recipient)
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

  // Proof through core's own eyes: the recipient now holds Supporters as an
  // additional group on the board's user screen, and the group's screen
  // carries the operator opt-in that allowed it.
  await page.goto('/admin/users')
  await page.getByRole('link', { name: recipient }).first().click()
  await expect(page.getByRole('heading', { name: 'Additional groups' })).toBeVisible()
  await snap(page, 'admin-user-additional-groups')

  await page.goto('/admin/groups/5001')
  await snap(page, 'admin-supporters-group')
})
