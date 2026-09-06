import { mkdirSync, writeFileSync } from 'node:fs'

import { expect, type Page, test } from '@playwright/test'

import { DEMO_BASE_URL } from './support/config'

const DIRECTORY = 'test-results/ui-polish'
const shots: string[] = []

async function snap(page: Page, name: string, fullPage = true) {
  if (name !== 'default-mobile-login') {
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/)
  }
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal { display: none }' })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    name,
  ).toBe(true)
  await page.screenshot({
    path: `${DIRECTORY}/${name}.png`,
    fullPage,
    caret: 'initial',
    animations: 'disabled',
  })
  shots.push(name)
}

function gallery() {
  const cards = shots
    .map(
      (name) =>
        `<a href="${name}.png"><img src="${name}.png" alt="${name.replaceAll('-', ' ')}" loading="lazy"><span>${name.replaceAll('-', ' ')}</span></a>`,
    )
    .join('')
  writeFileSync(
    `${DIRECTORY}/index.html`,
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meith · UI review</title><style>body{margin:0;padding:40px;font:15px/1.5 system-ui;background:#f4f4f4;color:#222}main{max-width:1280px;margin:auto}h1{font-size:32px;margin:0}p{color:#666;margin-bottom:32px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}a{overflow:hidden;border:1px solid #ddd;border-radius:12px;background:white;color:inherit;text-decoration:none}a:hover{border-color:#087f5b}a:focus-visible{outline:3px solid #087f5b;outline-offset:4px}img{display:block;width:100%;height:240px;object-fit:cover;object-position:top;border-bottom:1px solid #ddd}span{display:block;padding:16px;text-transform:capitalize;font-weight:600}</style><main><h1>Meith · UI review</h1><p>Populated demo · shared design system · all five themes · light, dark and touch layouts. Select a screenshot to see the full page.</p><div class="grid">${cards}</div></main></html>`,
  )
}

test('the populated demo across themes, panels and plugins', async ({
  page,
  context,
  browser,
  request,
}) => {
  mkdirSync(DIRECTORY, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await request.post('/api/system/tick', {
    headers: { authorization: 'Bearer shots-only-tick-secret-0000000000' },
  })
  await page.goto('/login')
  await page.getByLabel('Username or email').fill('admin')
  await page.getByLabel('Password', { exact: true }).fill('admin')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/')

  for (const theme of ['default', 'midnight', 'phasebook', 'raidframe', 'clubhouse']) {
    for (const scheme of ['light', 'dark']) {
      await context.addCookies([
        { name: 'meith_theme', value: theme, url: DEMO_BASE_URL },
        { name: 'meith_scheme', value: scheme, url: DEMO_BASE_URL },
      ])
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await snap(page, `${theme}-${scheme}`)
    }
  }
  await context.addCookies([
    { name: 'meith_theme', value: 'default', url: DEMO_BASE_URL },
    { name: 'meith_scheme', value: 'light', url: DEMO_BASE_URL },
  ])
  for (const [name, path] of [
    ['forum', '/15-general-discussion'],
    ['thread', '/thread/121'],
    ['composer', '/thread/121/reply'],
    ['search', '/search'],
    ['search-results', '/search?q=club'],
    ['profile', '/member/1'],
    ['user-panel', '/usercp'],
    ['account-options', '/usercp/options'],
    ['messages', '/messages'],
    ['moderator-panel', '/modcp'],
    ['moderation-queue', '/moderation'],
    ['calendar', '/plugins/calendar'],
    ['membership', '/plugins/dues'],
  ] as const) {
    await page.goto(path)
    await snap(page, `default-${name}`)
  }
  await page.goto('/admin')
  await page.getByLabel('Password', { exact: true }).fill('admin')
  await page.getByRole('button', { name: 'Enter the control panel' }).click()
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  for (const [name, path] of [
    ['admin-panel', '/admin'],
    ['admin-themes', '/admin/themes'],
    ['admin-calendar', '/admin/plugins/calendar/organisers'],
    ['admin-membership', '/admin/plugins/dues/plans'],
  ] as const) {
    await page.goto(path)
    await snap(page, `default-${name}`)
  }
  await context.addCookies([{ name: 'meith_scheme', value: 'dark', url: DEMO_BASE_URL }])
  for (const [name, path] of [
    ['account-options', '/usercp/options'],
    ['moderator-panel', '/modcp'],
    ['admin-panel', '/admin'],
    ['calendar', '/plugins/calendar'],
    ['membership', '/plugins/dues'],
  ] as const) {
    await page.goto(path)
    await snap(page, `default-dark-${name}`)
  }
  await context.addCookies([{ name: 'meith_scheme', value: 'light', url: DEMO_BASE_URL }])
  const mobile = await browser.newContext({
    baseURL: DEMO_BASE_URL,
    storageState: await context.storageState(),
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  })
  const phone = await mobile.newPage()
  for (const [name, path] of [
    ['home', '/'],
    ['thread', '/thread/121'],
    ['user-panel', '/usercp/options'],
    ['moderator-panel', '/modcp'],
    ['admin-panel', '/admin'],
    ['calendar', '/plugins/calendar'],
    ['membership', '/plugins/dues'],
    ['admin-membership', '/admin/plugins/dues/plans'],
  ] as const) {
    await phone.goto(path)
    await snap(phone, `default-mobile-${name}`)
  }
  await phone.goto('/admin/plugins/dues/codes')
  const activeTab = phone.locator('[data-nav-tabs] [aria-current="page"]')
  await expect(activeTab).toBeInViewport({ ratio: 1 })
  await snap(phone, 'default-mobile-active-plugin-tab', false)
  await phone.goto('/')
  await phone.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await phone
    .getByRole('dialog')
    .locator('summary')
    .filter({ hasText: /^Membership$/ })
    .click()
  await snap(phone, 'default-mobile-main-navigation', false)
  await phone.goto('/admin')
  await snap(phone, 'default-mobile-panel-header', false)
  await phone.getByRole('button', { name: 'Open panel navigation' }).click()
  await phone.getByRole('dialog').locator('summary').filter({ hasText: 'Board settings' }).click()
  await snap(phone, 'default-mobile-admin-navigation', false)
  await phone.goto('/admin/settings?group=registration')
  await phone.getByRole('button', { name: 'Open panel navigation' }).click()
  await snap(phone, 'default-mobile-admin-subsections', false)
  await phone.goto('/usercp/options')
  await phone.getByRole('button', { name: 'Open panel navigation' }).click()
  await snap(phone, 'default-mobile-account-navigation', false)
  await phone.goto('/search?q=club')
  await snap(phone, 'default-mobile-search-results')
  await mobile.clearCookies()
  await phone.goto('/login')
  await snap(phone, 'default-mobile-login')
  await mobile.close()
  gallery()
})
