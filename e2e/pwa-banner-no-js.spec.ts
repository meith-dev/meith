import { expect, type Page, test } from '@playwright/test'

import { enterAdminPanel } from './support/session'

test.use({ javaScriptEnabled: false })

const MOBILE = { width: 390, height: 844 }

async function setInstallBanner(admin: Page, on: boolean): Promise<void> {
  await admin.goto('/admin/settings?group=board')
  const box = admin.locator('input[name="board.install_banner"]')
  if (on) await box.check()
  else await box.uncheck()
  await admin.getByRole('button', { name: 'Save settings' }).click()
  if (on) await expect(admin.locator('input[name="board.install_banner"]')).toBeChecked()
  else await expect(admin.locator('input[name="board.install_banner"]')).not.toBeChecked()
}

test('the install banner obeys the setting, the viewport, and its dismissal', async ({
  browser,
}) => {
  const staff = await browser.newContext({ javaScriptEnabled: false })
  const admin = await staff.newPage()

  const phoneContext = await browser.newContext({ javaScriptEnabled: false, viewport: MOBILE })
  const phone = await phoneContext.newPage()

  try {
    await phone.goto('/')
    await expect(phone.getByText(/add it to your home screen/)).toHaveCount(0)

    await enterAdminPanel(admin)
    await setInstallBanner(admin, true)

    await phone.goto('/')
    await expect(phone.getByText(/add it to your home screen/)).toBeVisible()
    await expect(phone.getByText('Install', { exact: true })).toBeVisible()
    await phone.getByText('Install', { exact: true }).click()
    await expect(phone.getByText(/Add to Home Screen/)).toBeVisible()

    await admin.goto('/')
    await expect(admin.getByText(/add it to your home screen/)).not.toBeVisible()

    await phone.getByRole('button', { name: 'Not now' }).click()
    await expect(phone.getByText(/add it to your home screen/)).toHaveCount(0)

    await phone.goto('/')
    await expect(phone.getByText(/add it to your home screen/)).toHaveCount(0)
  } finally {
    await setInstallBanner(admin, false).catch(() => {})
    await staff.close()
    await phoneContext.close()
  }
})
