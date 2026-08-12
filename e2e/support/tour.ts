import { createHmac } from 'node:crypto'
import { mkdirSync } from 'node:fs'

import { expect, type APIRequestContext, type Page } from '@playwright/test'

import { E2E_DUES_WEBHOOK_SECRET } from './config'

export function screenshotter(directory: string): (page: Page, name: string) => Promise<void> {
  mkdirSync(directory, { recursive: true })

  let shot = 0
  return async (page, name) => {
    shot += 1
    await page.screenshot({
      path: `${directory}/${String(shot).padStart(2, '0')}-${name}.png`,
      fullPage: true,
    })
  }
}

let events = 0

export async function sendPaidWebhook(
  request: APIRequestContext,
  sessionId: string,
  amount = 1200,
  subscription: string | null = null,
): Promise<void> {
  events += 1

  const body = JSON.stringify({
    id: `evt_shot_${Date.now()}_${events}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status: 'paid',
        amount_total: amount,
        currency: 'gbp',
        subscription,
        payment_intent: subscription === null ? `pi_${sessionId}` : null,
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
