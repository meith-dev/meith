import { mkdirSync, writeFileSync } from 'node:fs'

import { expect, type Page, test } from '@playwright/test'

import { SLOT_NAMES } from '@meith/theme-kit'

import { FIXTURE_BASE_URL } from './support/config'

const DIRECTORY = 'test-results/ui-polish'
const shots: string[] = []

test('theme developers can browse every fixture slot', async ({ page, context }) => {
  mkdirSync(DIRECTORY, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const theme of ['default', 'midnight', 'phasebook', 'raidframe', 'clubhouse']) {
    await context.addCookies([{ name: 'meith_theme', value: theme, url: FIXTURE_BASE_URL }])
    for (const slot of SLOT_NAMES) {
      const response = await page.goto(`/fixtures?slot=${slot}`)
      expect(response?.status(), `${theme} ${slot}`).toBe(200)
      await expect(page.locator('[data-fixture-slot]')).toHaveAttribute('data-fixture-slot', slot)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    }
    await page.goto('/fixtures?slot=ThreadView&variant=poll')
    await expect(page.getByRole('heading', { name: 'When should we meet?' })).toBeVisible()
    await snap(page, `${theme}-fixture-poll`)
    await page.goto('/fixtures?slot=PanelShell&variant=admincp')
    await snap(page, `${theme}-fixture-panel`)
    expect(errors, theme).toEqual([])
  }
})

test('fixture editors and native forms stay read-only', async ({ page, context, browser }) => {
  mkdirSync(DIRECTORY, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await context.addCookies([{ name: 'meith_theme', value: 'default', url: FIXTURE_BASE_URL }])
  await page.goto('/fixtures?slot=EditorToolbar')
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') requests.push(request.url())
  })
  const field = page.getByRole('textbox', { name: 'Message', exact: true })
  await field.fill('A sample')
  await field.selectText()
  await page.getByRole('button', { name: 'Bold', exact: true }).click()
  await expect(field).toHaveValue('**A sample**')
  await page.getByRole('button', { name: 'Preview submission' }).click()
  await expect(page.getByRole('status')).toContainText('not saved')
  expect(requests).toEqual([])

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/fixtures?slot=PostBit&variant=rich')
  await expect(page.locator('[data-fixture-slot] img:visible').first()).toBeVisible()
  for (const image of await page.locator('[data-fixture-slot] img:visible').all())
    await image.scrollIntoViewIfNeeded()
  expect(
    await page
      .locator('[data-fixture-slot] img:visible')
      .evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true)
  await snap(page, 'default-fixture-rich-mobile')

  const native = await browser.newContext({ baseURL: FIXTURE_BASE_URL, javaScriptEnabled: false })
  const nativePage = await native.newPage()
  await nativePage.goto('/fixtures?slot=SearchResults&variant=empty')
  await expect(nativePage.locator('[data-fixture-slot]')).toHaveAttribute(
    'data-fixture-variant',
    'empty',
  )
  await nativePage.getByRole('combobox', { name: 'Slot', exact: true }).selectOption('PostForm')
  await nativePage.getByRole('button', { name: 'Show slot' }).click()
  await expect(nativePage.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible()
  const submitted = await nativePage.request.post('/fixtures', {
    form: { message: 'Must not save' },
  })
  expect(submitted.status()).toBe(200)
  expect(await submitted.text()).toContain('submissions are not saved')
  expect(await submitted.text()).not.toContain('Must not save')
  await native.close()
  expect(errors).toEqual([])
})

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
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meith · UI review</title><style>body{margin:0;padding:40px;font:15px/1.5 system-ui;background:#f4f4f4;color:#222}main{max-width:1280px;margin:auto}h1{font-size:32px;margin:0}p{color:#666;margin-bottom:32px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}a{overflow:hidden;border:1px solid #ddd;border-radius:12px;background:white;color:inherit;text-decoration:none}a:hover{border-color:#087f5b}a:focus-visible{outline:3px solid #087f5b;outline-offset:4px}img{display:block;width:100%;height:240px;object-fit:cover;object-position:top;border-bottom:1px solid #ddd}span{display:block;padding:16px;text-transform:capitalize;font-weight:600}</style><main><h1>Meith · UI review</h1><p>Populated fixture · shared design system · all five themes · light, dark and touch layouts. Select a screenshot to see the full page.</p><div class="grid">${cards}</div></main></html>`,
  )
}

test('the populated fixture across themes and reading layouts', async ({
  page,
  context,
  browser,
}) => {
  mkdirSync(DIRECTORY, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const theme of ['default', 'midnight', 'phasebook', 'raidframe', 'clubhouse']) {
    for (const scheme of ['light', 'dark']) {
      await context.addCookies([
        { name: 'meith_theme', value: theme, url: FIXTURE_BASE_URL },
        { name: 'meith_scheme', value: scheme, url: FIXTURE_BASE_URL },
      ])
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByRole('heading', { name: 'Latest threads', exact: true })).toBeVisible()
      await expect(
        page.getByRole('region', { name: /^(Board statistics|Board stats|Club record)$/ }),
      ).toBeVisible()
      await snap(page, `${theme}-${scheme}`)
    }
  }
  await context.addCookies([
    { name: 'meith_theme', value: 'default', url: FIXTURE_BASE_URL },
    { name: 'meith_scheme', value: 'light', url: FIXTURE_BASE_URL },
  ])
  for (const [name, path] of [
    ['forum', '/200-general'],
    ['thread', '/thread/21-show-us-your-desk-setup'],
    ['search', '/search'],
    ['profile', '/member/1'],
  ] as const) {
    await page.goto(path)
    await snap(page, `default-${name}`)
  }
  const mobile = await browser.newContext({
    baseURL: FIXTURE_BASE_URL,
    storageState: await context.storageState(),
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  })
  const phone = await mobile.newPage()
  for (const [name, path] of [
    ['home', '/'],
    ['thread', '/thread/21-show-us-your-desk-setup'],
    ['profile', '/member/1'],
  ] as const) {
    await phone.goto(path)
    await snap(phone, `default-mobile-${name}`)
  }
  await phone.goto('/')
  await phone.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await snap(phone, 'default-mobile-main-navigation', false)
  await phone.goto('/login')
  await snap(phone, 'default-mobile-login')
  await mobile.close()
  gallery()
})
