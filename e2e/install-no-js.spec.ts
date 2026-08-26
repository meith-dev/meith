import { expect, type Page, test } from '@playwright/test'

test.use({ javaScriptEnabled: false })

const BOARD = 'E2E Test Board'
const ADMIN = 'boardowner'
const PASSWORD = 'correct horse battery staple'

async function headingStyle(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((node) => {
      const style = getComputedStyle(node)
      return {
        family: style.fontFamily.split(',')[0]?.trim(),
        size: style.fontSize,
        weight: style.fontWeight,
      }
    })
}

test('a board is installed from a migrated, empty database, with no scripting', async ({
  page,
}) => {
  await page.goto('/install')

  for (const selector of ['h1', '#preflight', '[data-slot=card-title]']) {
    const { family } = await headingStyle(page, selector)
    expect(family, `${selector} should not be set in a serif`).not.toMatch(
      /newsreader|serif|georgia|baskerville|hoefler/i,
    )
  }

  const passed = page.getByRole('group').filter({ hasText: /checks? passed/ })
  await expect(passed).toBeVisible()
  await expect(passed).not.toHaveAttribute('open', '')

  await expect(page.getByText('Mail is not configured yet')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Install' })).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Your board' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sending mail' })).toBeVisible()

  await expect(page.locator('#boardUrl')).toHaveValue(/^http:\/\/127\.0\.0\.1:\d+$/)

  await expect(page.locator('#username-description, #field-username-description')).toContainText(
    'admin',
  )

  await page.locator('#boardName').fill(BOARD)
  await page.locator('#username').fill('admin')
  await page.locator('#email').fill('owner@example.test')
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Install' }).click()

  const outcome = page.getByRole('alert').filter({ hasText: 'did not finish' })
  await expect(outcome).toContainText('“Create the administrator” did not finish.')
  await expect(outcome).not.toContainText('“admin” step')

  await expect(page.locator('#username')).toHaveAttribute('aria-invalid', 'true')
  await expect(outcome.getByRole('link', { name: /name/i })).toHaveAttribute('href', '#username')

  const report = page.getByRole('group').filter({ hasText: 'How far it got' })
  await expect(report).toHaveAttribute('open', '')
  await expect(report).toContainText('Check the schema')
  await expect(report.getByRole('listitem').nth(0)).toContainText('done')
  await expect(report.getByRole('listitem').nth(1)).toContainText('done')
  await expect(report.getByRole('listitem').nth(2)).toContainText('failed')
  await expect(report.getByRole('listitem').nth(3)).toContainText('not run')
  await expect(report.getByRole('listitem').nth(4)).toContainText('not run')

  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()

  await expect(page.locator('#boardName')).toHaveValue(BOARD)
  await expect(page.locator('#password')).toHaveValue('')

  const board = await page.context().newPage()
  const halfBuilt = await board.goto('/')
  expect(halfBuilt?.status()).toBe(200)
  await expect(board.getByRole('link', { name: 'General discussion' })).toHaveCount(0)
  await board.close()

  await page.locator('#username').fill(ADMIN)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Try again' }).click()

  await expect(page).toHaveURL(/\/login\?installed=1$/)
  await expect(page.getByText('Your board is installed')).toBeVisible()

  const sealed = await page.goto('/install')
  expect(sealed?.status()).toBe(404)

  await page.goto('/login')
  await page.getByLabel('Username or email').fill(ADMIN)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')

  await expect(page.getByRole('link', { name: 'General discussion' })).toBeVisible()

  await page.getByRole('link', { name: 'General discussion' }).click()

  const [composer] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/2-general-discussion/new')),
    page.getByRole('link', { name: 'New thread' }).click(),
  ])
  expect(composer.status(), 'the composer 404d on a forum the index had just linked to').toBe(200)
  await expect(page.getByLabel('Subject')).toBeVisible()

  await page.goto('/admin')
  await expect(page.getByText('Confirm your password')).toBeVisible()
  await expect(page.getByText(/session has expired/)).toHaveCount(0)
})
