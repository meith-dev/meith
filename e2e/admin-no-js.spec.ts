import { expect, type Page, test } from '@playwright/test'

import { STAFF, STAFF_PASSWORD } from './support/config'
import { enterAdminPanel, signInAsAdmin, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('the panel is a second door, even for an administrator already signed in', async ({
  page,
}) => {
  await signInAsAdmin(page)

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Control panel' })).toBeVisible()
  await expect(page.getByText('Confirm your password.')).toBeVisible()
  await expect(page.getByText(/expired/i)).toHaveCount(0)

  await page.getByLabel('Password').fill('not-the-password')
  await page.getByRole('button', { name: 'Enter the control panel' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toHaveCount(0)

  await page.getByLabel('Password').fill(STAFF_PASSWORD)
  await page.getByRole('button', { name: 'Enter the control panel' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out of the panel' }).click()
  await page.goto('/admin')
  await expect(page.getByText('Confirm your password.')).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
})

test('a board setting saved in the panel reaches the header and the title', async ({ page }) => {
  await enterAdminPanel(page)

  const name = `Meith E2E ${Date.now().toString(36)}`
  await page.goto('/admin/settings?group=board')
  await page.getByLabel('Board name').fill(name)
  await page.getByRole('button', { name: 'Save settings' }).click()

  await page.goto('/admin/settings?group=board')
  await expect(page.getByLabel('Board name')).toHaveValue(name)

  await page.goto('/')
  await expect(page.getByRole('banner').getByText(name)).toBeVisible()
  await expect(page).toHaveTitle(new RegExp(name.replace(/ /g, '\\s')))

  await page.goto('/admin/settings?group=board')
  await page.getByLabel('Board name').fill('Meith')
  await page.getByRole('button', { name: 'Save settings' }).click()
})

test('a forum created in the panel appears on the index, in the jump box, and opens', async ({
  page,
}) => {
  await enterAdminPanel(page)

  const title = `Test Forum ${Date.now().toString(36)}`
  const slug = `e2e-forum-${Date.now().toString(36)}`

  await page.goto('/admin/forums')
  await page.getByLabel('Kind').selectOption('forum')
  const inside = page.getByLabel('Inside')
  await inside.selectOption(
    (await inside.locator('option', { hasText: 'Main' }).first().getAttribute('value')) ?? '',
  )
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Slug').fill(slug)
  await page.getByLabel('Description').fill('Created by the browser suite.')
  await page.getByRole('button', { name: 'Create' }).click()

  await expect(page.getByText(`forum · /${slug}`)).toBeVisible()

  await page.goto('/')
  const listed = page.getByRole('link', { name: title })
  await expect(listed).toBeVisible()

  const jump = page.getByRole('combobox', { name: 'Jump to forum' })
  const option = jump.locator('option', { hasText: title })
  await expect(option).toHaveCount(1)

  await listed.click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByText('Created by the browser suite.')).toBeVisible()
})

test('an announcement written in the panel renders above the forums', async ({ page }) => {
  await enterAdminPanel(page)

  const title = `Scheduled downtime ${Date.now().toString(36)}`
  await page.goto('/admin/content/announcements')

  const composer = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add', exact: true }) })
  await composer.getByLabel('Title').fill(title)
  await composer.getByLabel('Message').fill('The board will be **down** on Sunday.')
  await composer.getByLabel('Where').selectOption({ label: 'The whole board' })
  await composer.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page.getByText('None. The board shows no announcements.')).toHaveCount(0)

  await page.goto('/')
  const announcement = page.locator('article', { hasText: title }).first()
  await expect(announcement).toBeVisible()
  await expect(announcement.locator('strong')).toHaveText('down')

  await expect(announcement.getByRole('link', { name: 'admin', exact: true })).toHaveClass(
    /\bgname-3\b/,
  )

  const guest = await page.context().browser()!.newContext({ javaScriptEnabled: false })
  const guestPage = await guest.newPage()
  await guestPage.goto('/')
  await expect(guestPage.getByText(title)).toBeVisible()
  await guest.close()

  await page.goto('/admin/content/announcements')
  const row = page.locator(`input[name="title"][value="${title}"]`)
  await expect(row).toHaveCount(1)

  const announcementId = await page
    .locator('form')
    .filter({ has: row })
    .locator('input[name="id"]')
    .inputValue()

  await page
    .locator('form')
    .filter({ has: page.locator(`input[name="id"][value="${announcementId}"]`) })
    .getByRole('button', { name: 'Remove', exact: true })
    .click()
  await expect(page.locator(`input[name="title"][value="${title}"]`)).toHaveCount(0)

  await page.goto('/')
  await expect(page.getByText(title)).toHaveCount(0)
})

function menuEditor(page: Page, value: string) {
  return page.locator('details').filter({ has: page.locator(`input[value="${value}"]`) })
}

async function openMenuEditor(page: Page, value: string) {
  const editor = menuEditor(page, value)
  await editor.locator('summary').click()
  return editor
}

async function addMenuItem(page: Page, label: string, href: string): Promise<void> {
  await page.goto('/admin/content/navigation')

  const composer = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add', exact: true }) })
  await composer.getByLabel('Label').fill(label)
  await composer.getByLabel('Address').fill(href)
  await composer.getByLabel('Shown to').selectOption({ label: 'Everyone' })
  await composer.getByLabel('Shown in the menu').check()
  await composer.getByRole('button', { name: 'Add', exact: true }).click()
}

async function removeMenuItem(page: Page, label: string): Promise<void> {
  await page.goto('/admin/content/navigation')

  const editor = await openMenuEditor(page, label)
  await editor.getByRole('button', { name: 'Remove this item' }).click()
}

test('a menu item added in the panel appears in the navigation, and one hidden leaves it', async ({
  page,
}) => {
  await enterAdminPanel(page)

  const label = `Handbook ${Date.now().toString(36)}`
  await addMenuItem(page, label, 'https://example.com/handbook')

  const composed = await openMenuEditor(page, label)
  await composed.getByLabel('Open in a new tab').check()
  await composed.getByRole('button', { name: 'Save' }).click()

  await page.goto('/')
  const added = page.getByRole('banner').getByRole('link', { name: label })
  await expect(added).toBeVisible()
  await expect(added).toHaveAttribute('target', '_blank')
  await expect(added).toHaveAttribute('rel', 'noopener noreferrer')

  await page.goto('/admin/content/navigation')
  const online = await openMenuEditor(page, '/online')
  await online.getByLabel('Shown in the menu').uncheck()
  await online.getByRole('button', { name: 'Save' }).click()

  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('link', { name: "Who's online" })).toHaveCount(0)

  await page.goto('/admin/content/navigation')
  const restored = await openMenuEditor(page, '/online')
  await restored.getByLabel('Shown in the menu').check()
  await restored.getByRole('button', { name: 'Save' }).click()

  await removeMenuItem(page, label)

  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('link', { name: label })).toHaveCount(0)
  await expect(page.getByRole('banner').getByRole('link', { name: "Who's online" })).toBeVisible()
})

test('the arrows reorder the menu and tuck an item into a sub-menu', async ({ page }) => {
  await enterAdminPanel(page)

  const label = `Wiki ${Date.now().toString(36)}`
  const href = `https://example.com/wiki-${Date.now().toString(36)}`
  await addMenuItem(page, label, href)

  const navLabels = async (): Promise<string[]> =>
    (await page.getByRole('banner').locator('nav > div > ul > li > a').allInnerTexts()).map(
      (text) => text.trim(),
    )

  const nudge = async (direction: string): Promise<void> => {
    await page.getByRole('button', { name: `Move ${label} ${direction}` }).click()
    await page.waitForLoadState()
  }

  await page.goto('/')
  const placed = (await navLabels()).indexOf(label)
  expect(placed).toBeGreaterThan(1)

  await page.goto('/admin/content/navigation')
  await nudge('up')
  await nudge('up')

  await page.goto('/')
  expect((await navLabels()).indexOf(label)).toBe(placed - 2)

  await page.goto('/admin/content/navigation')
  await nudge('under the item above it')
  await expect(
    page.getByRole('button', { name: `Move ${label} back to the top level` }),
  ).toBeEnabled()

  await page.goto('/')
  await expect(page.getByRole('banner').locator(`ul ul a[href="${href}"]`)).toHaveCount(1)
  await expect(page.getByRole('banner').locator(`nav a[href="${href}"]`)).toHaveCount(1)
  await expect(page.getByRole('banner').getByRole('link', { name: label })).toHaveCount(0)

  await page.goto('/admin/content/navigation')
  await nudge('back to the top level')

  await page.goto('/')
  await expect(page.getByRole('banner').locator(`ul ul a[href="${href}"]`)).toHaveCount(0)
  await expect(page.getByRole('banner').getByRole('link', { name: label })).toHaveCount(1)

  await removeMenuItem(page, label)
})

test('a word filter added in the panel rewrites a post written before it', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const memberContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  const memberPage = await memberContext.newPage()

  try {
    await signUp(memberPage, 'filtered')

    const word = `frobnicate${Date.now().toString(36)}`
    await memberPage.goto('/200-general')
    await memberPage.getByRole('link', { name: 'New thread' }).click()
    await memberPage.getByLabel('Subject').fill(`Filter me ${Date.now().toString(36)}`)
    await memberPage.getByLabel('Message').fill(`Nobody should ${word} in here.`)
    await memberPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(memberPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = memberPage.url()

    await expect(memberPage.getByText(`Nobody should ${word} in here.`)).toBeVisible()

    await enterAdminPanel(adminPage)
    await adminPage.goto('/admin/content')
    const composer = adminPage.locator('form').filter({ hasText: 'Blank removes the word' })
    await composer.getByLabel('Match').fill(word)
    await composer.getByLabel('Show instead').fill('tinker')
    await composer.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(adminPage.getByText('No filters. Posts show as written.')).toHaveCount(0)

    await expect(async () => {
      await memberPage.goto(threadUrl)
      await expect(memberPage.getByText('Nobody should tinker in here.')).toBeVisible({
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] })

    await expect(memberPage.getByText(word)).toHaveCount(0)
  } finally {
    await adminContext.close()
    await memberContext.close()
  }
})

test('the admin log records the panel action that caused it', async ({ page }) => {
  await enterAdminPanel(page)

  await page.goto('/admin/log')
  const entry = page.locator('li', { hasText: 'admin.signed_in' }).first()
  await expect(entry).toBeVisible()
  await expect(entry).toContainText(STAFF.admin.username)
  await expect(entry).toContainText('from 127.0.0.0/24')

  await page.goto('/admin/log?action=admin.signed_in')
  await expect(page.locator('li', { hasText: 'admin.signed_in' }).first()).toBeVisible()
})

test('the system screen reports the board it is looking at', async ({ page }) => {
  await enterAdminPanel(page)
  await page.goto('/admin/system')

  await expect(
    page.locator('p:not([role="status"])').filter({ hasText: /\d+ indexed/ }),
  ).toBeVisible()

  await expect(page.getByText(/\d+ members/)).toBeVisible()
  await expect(page.getByText(/\d+ posts/)).toBeVisible()
})

test('the panel sends a guest to sign in and answers a member with a 404', async ({ browser }) => {
  const guestContext = await browser.newContext()
  const memberContext = await browser.newContext()
  const guestPage = await guestContext.newPage()
  const memberPage = await memberContext.newPage()

  try {
    for (const url of ['/admin', '/admin/settings', '/admin/users', '/admin/log']) {
      await guestPage.goto(url)
      await expect(guestPage, `guest ${url}`).toHaveURL(`/login?next=${encodeURIComponent(url)}`)
      await expect(guestPage.getByRole('button', { name: 'Sign in' })).toBeVisible()
    }

    await signUp(memberPage, 'nopanel')
    for (const url of ['/admin', '/admin/settings', '/admin/users', '/admin/log']) {
      expect((await memberPage.goto(url))?.status(), `member ${url}`).toBe(404)
    }
  } finally {
    await guestContext.close()
    await memberContext.close()
  }
})
