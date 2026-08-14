import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'

import { SCHEME_COOKIE, THEME_COOKIE } from '../apps/community/src/view/theme-preference'

import { DEMO_BASE_URL } from './support/config'

function shotsDirectory(): string {
  return path.resolve(test.info().config.rootDir, '../apps/web/public/shots')
}

const TICK_SECRET = 'shots-only-tick-secret-0000000000'

const DESKTOP = { width: 1280, height: 820 }
const PHONE = { width: 390, height: 780 }
const SCALE = 2

const THEMES = ['default', 'clubhouse', 'midnight', 'phasebook', 'raidframe'] as const

const SCHEMES = ['light', 'dark'] as const

const RECENT_THREADS = '/discover/new'
const THREAD_LINK = 'a[href^="/thread/"]'

const SEARCH_TERM = 'training'

const HIDE_DEV_CHROME = `
  aside[aria-label="About this demo"] { display: none !important }
  nextjs-portal { display: none !important }
`

async function shoot(page: Page, name: string): Promise<void> {
  await page.addStyleTag({ content: HIDE_DEV_CHROME })

  await expect(page.locator('aside[aria-label="About this demo"]')).toBeHidden()

  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(shotsDirectory(), `${name}.png`) })
}

async function paint(
  context: BrowserContext,
  page: Page,
  options: { theme?: string; scheme?: 'light' | 'dark' },
  at?: string,
): Promise<void> {
  const scope = { domain: new URL(DEMO_BASE_URL).hostname, path: '/' } as const

  const cookies = []
  if (options.theme !== undefined) {
    cookies.push({ name: THEME_COOKIE, value: options.theme, ...scope })
  }
  if (options.scheme !== undefined) {
    cookies.push({ name: SCHEME_COOKIE, value: options.scheme, ...scope })
  }

  await context.addCookies(cookies)

  if (at === undefined) await page.reload()
  else await page.goto(at)
}

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
}

async function warmTheBoard(request: APIRequestContext, page: Page): Promise<void> {
  await expect(async () => {
    await request.get(`/api/system/tick?secret=${TICK_SECRET}`)
    await page.goto(`/search?q=${SEARCH_TERM}`)
    await expectResults(page)
  }).toPass({ timeout: 120_000, intervals: [1_000, 2_000, 5_000, 10_000] })
}

async function expectResults(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/search\/[\w-]+$/)
  await expect(page.getByRole('heading', { name: /Results for/ })).toBeVisible()
  await expect(page.getByText(/searching very quickly/i)).toBeHidden()
  await expect(page.getByText(/^No results/i)).toBeHidden()
  await expect(page.getByText(/Nothing matched/i)).toBeHidden()
  await expect(page.locator('a[href^="/thread/"]').first()).toBeVisible()
}

test('the marketing site, photographed', async ({ browser, request }) => {
  rmSync(shotsDirectory(), { recursive: true, force: true })
  mkdirSync(shotsDirectory(), { recursive: true })

  const desktop = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: SCALE })
  const page = await desktop.newPage()

  await signIn(page, 'member', 'member')

  await warmTheBoard(request, page)

  await expect(page.getByRole('button', { name: 'Your account' })).toBeVisible()

  await page.goto('/')

  await expect(page.getByRole('link', { name: 'Noticeboard' }).first()).toBeVisible()

  for (const theme of THEMES) {
    for (const scheme of SCHEMES) {
      await paint(desktop, page, { theme, scheme })
      await shoot(page, `theme-${theme}-${scheme}`)
    }
  }

  await paint(desktop, page, { theme: 'default' })

  await expect(async () => {
    await page.goto(`/search?q=${SEARCH_TERM}`)
    await expectResults(page)
  }).toPass({ timeout: 120_000, intervals: [2_000, 5_000, 10_000, 15_000] })

  const results = page.url()

  for (const scheme of SCHEMES) {
    await paint(desktop, page, { scheme }, results)
    await expectResults(page)
    await shoot(page, `search-${scheme}`)
  }

  const guest = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: SCALE })
  const guestPage = await guest.newPage()
  await guestPage.goto('/plugins/dues')
  await expect(guestPage.getByRole('heading', { level: 1 })).toBeVisible()

  for (const scheme of SCHEMES) {
    await paint(guest, guestPage, { scheme })
    await shoot(guestPage, `dues-${scheme}`)
  }

  await guest.close()
  await desktop.close()

  const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: SCALE })
  const phonePage = await phone.newPage()

  await signIn(phonePage, 'member', 'member')

  await phonePage.goto(RECENT_THREADS)
  const phoneThread = phonePage.locator(THREAD_LINK).first()
  await expect(phoneThread).toBeVisible()
  await phoneThread.click()
  await expect(phonePage).toHaveURL(/\/thread\//)

  for (const scheme of SCHEMES) {
    await paint(phone, phonePage, { theme: 'default', scheme })
    await shoot(phonePage, `thread-mobile-${scheme}`)
  }

  await phone.close()
})
