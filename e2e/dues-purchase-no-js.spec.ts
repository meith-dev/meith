import { createHmac } from 'node:crypto'

import { type APIRequestContext, expect, type Page, test } from '@playwright/test'

import { E2E_DUES_WEBHOOK_SECRET } from './support/config'
import { enterAdminPanel, signInAsModerator, signUp } from './support/session'

test.describe.configure({ mode: 'serial' })

function signedWebhook(body: string): { body: string; headers: Record<string, string> } {
  const timestamp = Math.floor(Date.now() / 1000)
  const mac = createHmac('sha256', E2E_DUES_WEBHOOK_SECRET)
  mac.update(`${timestamp}.${body}`, 'utf8')
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${mac.digest('hex')}`,
    },
  }
}

let eventCounter = 0

async function sendPaidWebhook(
  request: APIRequestContext,
  session: { id: string; amount: number },
): Promise<void> {
  eventCounter += 1
  const payload = JSON.stringify({
    id: `evt_e2e_${Date.now()}_${eventCounter}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: session.id,
        object: 'checkout.session',
        payment_status: 'paid',
        amount_total: session.amount,
        currency: 'gbp',
        subscription: null,
        payment_intent: `pi_${session.id}`,
        customer: 'cus_e2e',
      },
    },
  })
  const signed = signedWebhook(payload)
  const response = await request.post('/api/plugins/dues/hook/stripe', {
    data: signed.body,
    headers: signed.headers,
  })
  expect(response.status()).toBe(200)
  expect((await response.json()) as { outcome?: string }).toMatchObject({ received: true })
}

async function payOnFakeStripe(page: Page): Promise<string> {
  await expect(page).toHaveURL(/127\.0\.0\.1:12111\/checkout\//)
  const sessionId = page.url().split('/checkout/')[1] as string
  await page.locator('#pay').click()
  return sessionId
}

test('a guest sees the shop window but cannot buy', async ({ page }) => {
  await page.goto('/plugins/dues')

  await expect(page.getByRole('heading', { name: 'Membership', exact: true })).toBeVisible()
  await expect(page.getByText('£12.00 · 90 days')).toBeVisible()
  await expect(page.getByText('£5.00 every month')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in to join' }).first()).toBeVisible()

  const shades = await page.evaluate(() => {
    const card = [...document.querySelectorAll('section')].find((section) =>
      section.className.includes('bg-card'),
    )
    return {
      card: card === undefined ? null : getComputedStyle(card).backgroundColor,
      page: getComputedStyle(document.body).backgroundColor,
    }
  })

  expect(shades.card).not.toBeNull()
  expect(shades.card).not.toBe(shades.page)

  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Membership' })).toHaveCount(0)
})

test('a member buys a 90-day pass and belongs before the receipt page reloads', async ({
  page,
  request,
}) => {
  await signUp(page, 'buyer')

  await page.goto('/')
  const banner = page.getByRole('banner')
  const membershipLink = banner.getByRole('link', { name: 'Membership', exact: true })
  await expect(membershipLink).toBeVisible()
  await membershipLink.hover()
  await expect(banner.getByRole('link', { name: 'Your membership' })).toBeVisible()

  await page.goto('/plugins/dues')
  await page
    .locator('section', { has: page.getByRole('heading', { name: '90-day pass' }) })
    .getByRole('button', { name: 'Buy this pass' })
    .click()

  const sessionId = await payOnFakeStripe(page)

  await expect(page).toHaveURL(/\/plugins\/dues\/return\?order=\d+$/)
  await expect(page.getByRole('heading', { name: 'Confirming your payment…' })).toBeVisible()

  await sendPaidWebhook(request, { id: sessionId, amount: 1200 })

  await page.getByRole('link', { name: 'Check again' }).click()
  await expect(page.getByRole('heading', { name: 'Paid, and done' })).toBeVisible()

  await page.goto('/plugins/dues')
  await expect(page.getByRole('heading', { name: 'What you hold' })).toBeVisible()
  await expect(page.getByText('yours until')).toBeVisible()

  await page.goto('/plugins/dues/manage')
  await expect(page.getByText('pass-90')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open the billing portal' })).toBeVisible()
})

test('the pass becomes the buyer’s group, on their profile and in the UserCP', async ({
  page,
  request,
}) => {
  const username = await signUp(page, 'wearer')

  await page.goto(`/member/by-name/${username}`)
  await expect(page.getByText('Registered', { exact: true })).toBeVisible()

  await page.goto('/plugins/dues')
  await page
    .locator('section', { has: page.getByRole('heading', { name: '90-day pass' }) })
    .getByRole('button', { name: 'Buy this pass' })
    .click()

  const sessionId = await payOnFakeStripe(page)
  await sendPaidWebhook(request, { id: sessionId, amount: 1200 })

  await page.goto(`/member/by-name/${username}`)
  await expect(page.getByText('Supporters', { exact: true })).toBeVisible()

  await page.goto('/usercp/profile')
  const picker = page.getByLabel('Shown under your name')
  await expect(picker).toBeVisible()
  await picker.selectOption({ label: 'Registered' })
  await page.getByRole('button', { name: 'Save display group' }).click()

  await page.goto(`/member/by-name/${username}`)
  await expect(page.getByText('Registered', { exact: true })).toBeVisible()
})

test('a moderator who buys keeps their standing, and gets no display picker', async ({
  page,
  request,
}) => {
  const username = await signInAsModerator(page)

  await page.goto('/plugins/dues')
  await page
    .locator('section', { has: page.getByRole('heading', { name: '90-day pass' }) })
    .getByRole('button', { name: 'Buy this pass' })
    .click()

  const sessionId = await payOnFakeStripe(page)
  await sendPaidWebhook(request, { id: sessionId, amount: 1200 })

  await page.goto('/plugins/dues')
  await expect(page.getByRole('heading', { name: 'What you hold' })).toBeVisible()

  await page.goto(`/member/by-name/${username}`)
  await expect(page.getByText('Super Moderators', { exact: true })).toBeVisible()
  await expect(page.getByText('Supporters', { exact: true })).toBeVisible()

  await page.goto('/usercp/profile')
  await expect(page.getByText('Shown under your name')).toHaveCount(0)
})

test('a member gifts a pass to another member by name', async ({ page, request }) => {
  const giver = await signUp(page, 'giver')
  void giver

  const recipientPage = await page.context().browser()!.newPage()
  const recipient = await signUp(recipientPage, 'gifted')

  await page.goto('/plugins/dues')
  const passCard = page.locator('section', {
    has: page.getByRole('heading', { name: '90-day pass' }),
  })

  await passCard.getByLabel(/another member/).fill('nobody_of_that_name')
  await passCard.getByRole('button', { name: 'Buy this pass' }).click()
  await expect(page.getByText('No member goes by that name')).toBeVisible()

  const retryCard = page.locator('section', {
    has: page.getByRole('heading', { name: '90-day pass' }),
  })
  await expect(retryCard.getByLabel(/another member/)).toHaveValue('nobody_of_that_name')
  await retryCard.getByLabel(/another member/).fill(recipient)
  await retryCard.getByRole('button', { name: 'Buy this pass' }).click()

  const sessionId = await payOnFakeStripe(page)
  await sendPaidWebhook(request, { id: sessionId, amount: 1200 })

  await page.goto('/plugins/dues/manage')
  await expect(page.getByRole('heading', { name: 'Gifts you bought' })).toBeVisible()
  await expect(page.getByText('delivered')).toBeVisible()

  await recipientPage.goto('/plugins/dues')
  await expect(recipientPage.getByRole('heading', { name: 'What you hold' })).toBeVisible()
  await recipientPage.close()
})

test('the webhook endpoint refuses an unsigned and a tampered event', async ({ request }) => {
  const unsigned = await request.post('/api/plugins/dues/hook/stripe', {
    data: JSON.stringify({ id: 'evt_x', type: 'invoice.paid', data: { object: {} } }),
    headers: { 'content-type': 'application/json' },
  })
  expect(unsigned.status()).toBe(400)

  const signed = signedWebhook('{"id":"evt_y","type":"invoice.paid","data":{"object":{}}}')
  const tampered = await request.post('/api/plugins/dues/hook/stripe', {
    data: '{"id":"evt_z","type":"invoice.paid","data":{"object":{}}}',
    headers: signed.headers,
  })
  expect(tampered.status()).toBe(400)
})

test('the admin panel shows the machinery: status, events, memberships, ledger', async ({
  page,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/plugins/dues/status')
  await expect(page.getByRole('heading', { name: 'Is it working?' })).toBeVisible()
  await expect(page.getByText('set', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('checkout.session.completed').first()).toBeVisible()

  await page.goto('/admin/plugins/dues/members')
  await expect(page.getByText('pass-90').first()).toBeVisible()

  await page.goto('/admin/plugins/dues/ledger')
  await expect(page.getByText('£12.00').first()).toBeVisible()

  await page.goto('/admin/plugins/dues')
  await expect(page.getByText('DUES_STRIPE_SECRET_KEY')).toBeVisible()
  await expect(page.getByText('this box is inert').first()).toBeVisible()
})

test('an admin invents plans in the panel: a day pass, a price change, lifetime, off sale', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  await enterAdminPanel(page)

  await page.goto('/admin/plugins/dues/plans')
  const createForm = page.locator('form[action="/admin/api/plugins/dues/plans/create"]')
  await expect(createForm).toBeVisible()

  await createForm.getByLabel(/Key/).fill('day-pass')
  await createForm.getByLabel('Name', { exact: true }).fill('Day pass')
  await createForm.getByLabel(/Group it grants/).fill('supporters')
  await createForm.getByLabel(/Price in minor units/).fill('100')
  await createForm.getByLabel('Currency').fill('gbp')
  await createForm.getByLabel('Pass length').fill('1')
  await createForm.getByRole('button', { name: 'Put it on sale' }).click()
  await expect(page.getByText('The plan day-pass is on sale from this moment.')).toBeVisible()

  const buyerPage = await page.context().browser()!.newPage()
  await signUp(buyerPage, 'planbuyer')
  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByText('£1.00 · 1 day')).toBeVisible()

  const dayCard = buyerPage.locator('section', {
    has: buyerPage.getByRole('heading', { name: 'Day pass', exact: true }),
  })
  await dayCard.getByRole('button', { name: 'Buy this pass' }).click()
  const sessionId = await payOnFakeStripe(buyerPage)
  await sendPaidWebhook(request, { id: sessionId, amount: 100 })

  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByRole('heading', { name: 'What you hold' })).toBeVisible()

  await page.goto('/admin/plugins/dues/plans')
  const dayRow = page.locator('li', { hasText: 'day-pass' })
  await dayRow.getByText('Edit this plan').click()
  await dayRow.getByLabel(/Price in minor units/).fill('200')
  await dayRow.getByRole('button', { name: 'Save the plan' }).click()
  await expect(page.getByText('day-pass is updated.')).toBeVisible()

  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByText('£2.00 · 1 day')).toBeVisible()

  await page.goto('/admin/plugins/dues/plans')
  const create2 = page.locator('form[action="/admin/api/plugins/dues/plans/create"]')
  await create2.getByLabel(/Key/).fill('forever')
  await create2.getByLabel(/How it bills/).selectOption('lifetime')
  await create2.getByLabel('Name', { exact: true }).fill('Forever')
  await create2.getByLabel(/Group it grants/).fill('supporters')
  await create2.getByLabel(/Price in minor units/).fill('9900')
  await create2.getByLabel('Currency').fill('gbp')
  await create2.getByRole('button', { name: 'Put it on sale' }).click()
  await expect(page.getByText('The plan forever is on sale from this moment.')).toBeVisible()

  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByText('£99.00 · once, for good')).toBeVisible()
  const foreverCard = buyerPage.locator('section', {
    has: buyerPage.getByRole('heading', { name: 'Forever' }),
  })
  await foreverCard.getByRole('button', { name: 'Buy lifetime membership' }).click()
  const lifetimeSession = await payOnFakeStripe(buyerPage)
  await sendPaidWebhook(request, { id: lifetimeSession, amount: 9900 })

  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByText('yours for good')).toBeVisible()

  await page.goto('/admin/plugins/dues/plans')
  await page
    .locator('li', { hasText: 'day-pass' })
    .getByRole('button', { name: 'Take it off sale' })
    .click()
  await expect(page.getByText('day-pass is off sale.')).toBeVisible()

  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByRole('heading', { name: 'Day pass', exact: true })).toHaveCount(0)
  await expect(buyerPage.getByRole('heading', { name: '90-day pass' })).toBeVisible()
  await buyerPage.close()
})

test('an admin mints a code, a member redeems it at half price, the desk revokes', async ({
  page,
  request,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/plugins/dues/codes')
  await expect(page.getByRole('heading', { name: 'Mint a code' })).toBeVisible()
  await page.getByLabel(/Percent off/).fill('50')
  await page.getByRole('button', { name: 'Mint the code' }).click()
  await expect(page.getByText('The code is live:')).toBeVisible()
  const code = (await page.getByRole('status').locator('code').first().textContent())!.trim()
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)

  const buyerPage = await page.context().browser()!.newPage()
  const buyer = await signUp(buyerPage, 'redeemer')
  await buyerPage.goto('/plugins/dues')
  const passCard = buyerPage.locator('section', {
    has: buyerPage.getByRole('heading', { name: '90-day pass' }),
  })
  await passCard.getByLabel(/Discount code/).fill(code)
  await passCard.getByRole('button', { name: 'Buy this pass' }).click()

  await expect(buyerPage).toHaveURL(/127\.0\.0\.1:12111\/checkout\//)
  await expect(buyerPage.getByText('600 gbp')).toBeVisible()
  const sessionId = buyerPage.url().split('/checkout/')[1] as string
  await buyerPage.locator('#pay').click()
  await sendPaidWebhook(request, { id: sessionId, amount: 600 })

  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByRole('heading', { name: 'What you hold' })).toBeVisible()

  await page.goto('/admin/plugins/dues/codes')
  const codeRow = page.getByRole('row').filter({ hasText: code })
  await expect(codeRow.getByRole('cell', { name: '1', exact: true })).toBeVisible()

  await page.goto('/admin/plugins/dues/members')
  const memberRow = page.getByRole('row').filter({ hasText: buyer })
  await memberRow.getByRole('button', { name: 'Revoke now' }).click()
  await expect(page.getByText('Membership revoked')).toBeVisible()

  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByRole('heading', { name: 'What you hold' })).toHaveCount(0)
  await buyerPage.close()
})
