import { expect, type Page, test } from '@playwright/test'

import { enterAdminPanel, signUp } from './support/session'
import { screenshotter, sendPaidWebhook } from './support/tour'

const snap = screenshotter('/tmp/dues-plans-shots')

async function payOnFakeStripe(page: Page): Promise<string> {
  await expect(page).toHaveURL(/127\.0\.0\.1:12111\/checkout\//)
  const sessionId = page.url().split('/checkout/')[1] as string
  await page.locator('#pay').click()
  return sessionId
}

test('plans, purchases and refusals, photographed end to end', async ({ page, request }) => {
  test.setTimeout(300_000)

  await enterAdminPanel(page)

  await page.goto('/admin/plugins/dues/plans')
  await snap(page, 'admin-plans-as-seeded')

  const createForm = page.locator('form[action="/admin/api/plugins/dues/plans/create"]')
  await createForm.getByLabel(/Key/).fill('day-pass')
  await createForm.getByLabel('Name', { exact: true }).fill('Day pass')
  await createForm.getByLabel(/Group it grants/).fill('supporters')
  await createForm.getByLabel(/Price in minor units/).fill('200')
  await createForm.getByLabel('Currency').fill('gbp')
  await createForm.getByLabel('Pass length').fill('1')
  await snap(page, 'admin-day-pass-form')
  await createForm.getByRole('button', { name: 'Put it on sale' }).click()
  await expect(page.getByText('The plan day-pass is on sale')).toBeVisible()
  await snap(page, 'admin-day-pass-created')

  const create2 = page.locator('form[action="/admin/api/plugins/dues/plans/create"]')
  await create2.getByLabel(/Key/).fill('forever')
  await create2.getByLabel(/How it bills/).selectOption('lifetime')
  await create2.getByLabel('Name', { exact: true }).fill('Forever')
  await create2
    .getByLabel(/Description/)
    .fill('One payment. Supporters for as long as the board stands.')
  await create2.getByLabel(/Group it grants/).fill('supporters')
  await create2.getByLabel(/Price in minor units/).fill('9900')
  await create2.getByLabel('Currency').fill('gbp')
  await create2.getByRole('button', { name: 'Put it on sale' }).click()
  await expect(page.getByText('The plan forever is on sale')).toBeVisible()
  await snap(page, 'admin-lifetime-created')

  const create3 = page.locator('form[action="/admin/api/plugins/dues/plans/create"]')
  await create3.getByLabel(/Key/).fill('three-year')
  await create3.getByLabel('Name', { exact: true }).fill('Three years')
  await create3.getByLabel(/Group it grants/).fill('supporters')
  await create3.getByLabel(/Price in minor units/).fill('3000')
  await create3.getByLabel('Currency').fill('gbp')
  await create3.getByLabel('Pass length').fill('3')
  await create3.getByLabel(/counted in/).selectOption('years')
  await create3.getByRole('button', { name: 'Put it on sale' }).click()
  await expect(page.getByText(/cannot reach past two years/)).toBeVisible()
  await snap(page, 'admin-too-long-refused')

  const dayRow = page.locator('li', { hasText: 'day-pass' })
  await dayRow.getByText('Edit this plan').click()
  await dayRow.getByLabel(/Price in minor units/).fill('300')
  await snap(page, 'admin-edit-price')
  await dayRow.getByRole('button', { name: 'Save the plan' }).click()
  await expect(page.getByText('day-pass is updated.')).toBeVisible()
  await snap(page, 'admin-price-updated')

  await page.goto('/admin/plugins/dues/codes')
  await page.getByLabel(/leave empty to have one invented/).fill('HALFOFF')
  await page.getByLabel(/Percent off/).fill('50')
  await page.getByLabel(/Redemption cap/).fill('5')
  await page.getByRole('button', { name: 'Mint the code' }).click()
  await expect(page.getByText('The code is live:')).toBeVisible()
  await snap(page, 'admin-code-minted')

  const buyerPage = await page.context().browser()!.newPage()

  await buyerPage.goto('/plugins/dues')
  await snap(buyerPage, 'member-shop-as-guest')

  await signUp(buyerPage, 'shopper')
  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByText('£3.00 · 1 day')).toBeVisible()
  await snap(buyerPage, 'member-shop-signed-in')

  const dayCard = buyerPage.locator('section', {
    has: buyerPage.getByRole('heading', { name: 'Day pass', exact: true }),
  })
  await dayCard.getByLabel(/Discount code/).fill('HALFOFF')
  await snap(buyerPage, 'member-code-entered')
  await dayCard.getByRole('button', { name: 'Buy this pass' }).click()

  await expect(buyerPage.getByText('150 gbp')).toBeVisible()
  const daySession = await payOnFakeStripe(buyerPage)
  await expect(buyerPage).toHaveURL(/\/plugins\/dues\/return\?order=\d+$/)
  await sendPaidWebhook(request, daySession, 150)
  await buyerPage.getByRole('link', { name: 'Check again' }).click()
  await expect(buyerPage.getByRole('heading', { name: 'Paid, and done' })).toBeVisible()
  await snap(buyerPage, 'member-paid-half-price')

  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByRole('heading', { name: 'What you hold' })).toBeVisible()
  await snap(buyerPage, 'member-holds-day-pass')

  const foreverCard = buyerPage.locator('section', {
    has: buyerPage.getByRole('heading', { name: 'Forever' }),
  })
  await foreverCard.getByRole('button', { name: 'Buy lifetime membership' }).click()
  await snap(buyerPage, 'member-lifetime-checkout')
  const foreverSession = await payOnFakeStripe(buyerPage)
  await sendPaidWebhook(request, foreverSession, 9900)

  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByText('yours for good')).toBeVisible()
  await snap(buyerPage, 'member-holds-forever')

  const dayAgain = buyerPage.locator('section', {
    has: buyerPage.getByRole('heading', { name: 'Day pass', exact: true }),
  })
  await dayAgain.getByRole('button', { name: 'Buy this pass' }).click()
  await expect(buyerPage.getByText(/hold this membership for good already/)).toBeVisible()
  await snap(buyerPage, 'member-already-covered')

  await buyerPage.goto('/plugins/dues/manage')
  await snap(buyerPage, 'member-manage')

  const subPage = await page.context().browser()!.newPage()
  await signUp(subPage, 'subscriber')
  await subPage.goto('/plugins/dues')
  const subCard = subPage.locator('section', {
    has: subPage.getByRole('heading', { name: 'Supporter', exact: true }),
  })
  await subCard.getByRole('button', { name: 'Subscribe' }).click()
  const subSession = await payOnFakeStripe(subPage)
  await sendPaidWebhook(request, subSession, 500, `sub_${subSession}`)

  await subPage.goto('/plugins/dues')
  const subForever = subPage.locator('section', {
    has: subPage.getByRole('heading', { name: 'Forever' }),
  })
  await subForever.getByRole('button', { name: 'Buy lifetime membership' }).click()
  await expect(subPage.getByText(/Cancel its renewal first/)).toBeVisible()
  await snap(subPage, 'member-cancel-first')
  await subPage.close()

  await page.goto('/admin/plugins/dues/members')
  await snap(page, 'admin-members-desk')

  await page.goto('/admin/plugins/dues/ledger')
  await snap(page, 'admin-ledger')

  await page.goto('/admin/plugins/dues/plans')
  await page
    .locator('li', { hasText: 'day-pass' })
    .getByRole('button', { name: 'Take it off sale' })
    .click()
  await expect(page.getByText('day-pass is off sale.')).toBeVisible()
  await snap(page, 'admin-day-pass-off-sale')

  await buyerPage.goto('/plugins/dues')
  await expect(buyerPage.getByRole('heading', { name: 'Day pass', exact: true })).toHaveCount(0)
  await snap(buyerPage, 'member-shop-after-archive')
  await buyerPage.close()
})
